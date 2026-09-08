package lat.tappt.documentscanner

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import expo.modules.kotlin.Promise
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.io.Serializable
import java.util.UUID

class TapptDocumentScannerModule : Module() {
  private var pendingPromise: Promise? = null
  private var pendingIntentSenderRequest: IntentSenderRequest? = null
  private var activeScanId: String? = null
  private lateinit var scannerLauncher: AppContextActivityResultLauncher<ScanRequest, ScanActivityResult>

  override fun definition() = ModuleDefinition {
    Name("TapptDocumentScanner")

    RegisterActivityContracts {
      scannerLauncher = registerForActivityResult(ScanContract()) { _, result ->
        recoveredActivityResult = result
      }
    }

    AsyncFunction("scan") { options: Map<String, Any?>, promise: Promise ->
      val activity = appContext.currentActivity
      if (activity == null) {
        promise.reject("ERR_NO_ACTIVITY", "No se encontró una pantalla para abrir el escáner", null)
        return@AsyncFunction
      }
      if (pendingPromise != null) {
        promise.reject("ERR_SCANNER_BUSY", "Ya hay un escaneo en curso", null)
        return@AsyncFunction
      }

      pendingPromise = promise
      recoveredActivityResult?.let { recovered ->
        recoveredActivityResult = null
        activeScanId = recovered.scanId
        handleScanResult(recovered)
        return@AsyncFunction
      }

      val maxPages = (options["maxPages"] as? Number)?.toInt()?.coerceIn(1, 30) ?: 30
      val scannerOptions = GmsDocumentScannerOptions.Builder()
        .setGalleryImportAllowed(true)
        .setPageLimit(maxPages)
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
        // FULL conserva la interfaz nativa fluida de ML Kit y además activa
        // la limpieza por ML de sombras, manchas y dedos, junto con filtros.
        .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
        .build()

      val scanId = UUID.randomUUID().toString()
      activeScanId = scanId
      GmsDocumentScanning.getClient(scannerOptions)
        .getStartScanIntent(activity)
        .addOnSuccessListener { intentSender ->
          if (activeScanId != scanId || pendingPromise == null) return@addOnSuccessListener
          try {
            pendingIntentSenderRequest = IntentSenderRequest.Builder(intentSender).build()
            scannerLauncher.launch(ScanRequest(scanId)) { result ->
              handleScanResult(result)
            }
          } catch (error: Exception) {
            rejectPending("ERR_START_SCAN", error.message ?: "No se pudo abrir el escáner", error)
          }
        }
        .addOnFailureListener { error ->
          if (activeScanId != scanId) return@addOnFailureListener
          rejectPending("ERR_START_SCAN", error.message ?: "No se pudo abrir el escáner", error)
        }
    }

    AsyncFunction("cancel") {
      resolveCancelled()
    }

    OnDestroy {
      rejectPending("ERR_SCANNER_DESTROYED", "El escáner se cerró antes de terminar", null)
    }
  }

  private inner class ScanContract : AppContextActivityResultContract<ScanRequest, ScanActivityResult> {
    private val contract = ActivityResultContracts.StartIntentSenderForResult()

    override fun createIntent(context: Context, input: ScanRequest): Intent {
      val request = pendingIntentSenderRequest
        ?: throw IllegalStateException("No hay una solicitud de escaneo preparada")
      return contract.createIntent(context, request)
    }

    override fun parseResult(input: ScanRequest, resultCode: Int, intent: Intent?): ScanActivityResult {
      val intentSenderFailed = intent?.hasExtra(
        ActivityResultContracts.StartIntentSenderForResult.EXTRA_SEND_INTENT_EXCEPTION
      ) == true
      return ScanActivityResult(
        input.id,
        resultCode,
        intent,
        if (intentSenderFailed) "Android no pudo iniciar el escáner" else null
      )
    }
  }

  private fun handleScanResult(activityResult: ScanActivityResult) {
    if (activityResult.scanId != activeScanId) return
    pendingIntentSenderRequest = null
    activeScanId = null
    if (activityResult.errorMessage != null) {
      rejectPending("ERR_START_SCAN", activityResult.errorMessage, null)
      return
    }
    if (activityResult.resultCode == Activity.RESULT_CANCELED) {
      resolveCancelled()
      return
    }
    if (activityResult.resultCode != Activity.RESULT_OK) {
      rejectPending("ERR_SCAN_FAILED", "El escáner terminó con código ${activityResult.resultCode}", null)
      return
    }

    try {
      val result = GmsDocumentScanningResult.fromActivityResultIntent(activityResult.intent)
        ?: throw IllegalStateException("ML Kit no devolvió páginas")
      val pages = result.pages?.mapIndexed { index, page ->
        mapOf("uri" to copyToCache(page.imageUri, index))
      } ?: emptyList()
      pendingPromise?.resolve(mapOf("cancelled" to false, "engine" to "mlkit", "pages" to pages))
      pendingPromise = null
    } catch (error: Exception) {
      rejectPending("ERR_SAVE_SCAN", error.message ?: "No se pudieron guardar las páginas", error)
    }
  }

  private fun copyToCache(uri: Uri, index: Int): String {
    val context = appContext.reactContext ?: throw IllegalStateException("Contexto no disponible")
    val folder = File(context.cacheDir, "tapptscan-${UUID.randomUUID()}")
    if (!folder.exists() && !folder.mkdirs()) throw IllegalStateException("No se pudo crear caché")
    val destination = File(folder, "page-${index + 1}.jpg")
    context.contentResolver.openInputStream(uri).use { input ->
      requireNotNull(input) { "No se pudo leer la página ${index + 1}" }
      FileOutputStream(destination).use { output -> input.copyTo(output) }
    }
    return Uri.fromFile(destination).toString()
  }

  private fun rejectPending(code: String, message: String, cause: Throwable?) {
    pendingIntentSenderRequest = null
    activeScanId = null
    pendingPromise?.reject(code, message, cause)
    pendingPromise = null
  }

  private fun resolveCancelled() {
    pendingIntentSenderRequest = null
    activeScanId = null
    pendingPromise?.resolve(mapOf("cancelled" to true, "engine" to "mlkit", "pages" to emptyList<Any>()))
    pendingPromise = null
  }

  companion object {
    @Volatile
    private var recoveredActivityResult: ScanActivityResult? = null
  }
}

private data class ScanRequest(val id: String) : Serializable
private data class ScanActivityResult(
  val scanId: String,
  val resultCode: Int,
  val intent: Intent?,
  val errorMessage: String? = null
)
