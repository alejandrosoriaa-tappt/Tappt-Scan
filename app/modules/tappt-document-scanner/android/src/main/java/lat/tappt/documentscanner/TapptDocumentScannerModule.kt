package lat.tappt.documentscanner

import android.app.Activity
import android.content.Intent
import android.net.Uri
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID

class TapptDocumentScannerModule : Module() {
  private var pendingPromise: Promise? = null

  override fun definition() = ModuleDefinition {
    Name("TapptDocumentScanner")

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

      val maxPages = (options["maxPages"] as? Number)?.toInt()?.coerceIn(1, 100) ?: 50
      val scannerOptions = GmsDocumentScannerOptions.Builder()
        .setGalleryImportAllowed(true)
        .setPageLimit(maxPages)
        .setResultFormats(GmsDocumentScannerOptions.RESULT_FORMAT_JPEG)
        .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_BASE)
        .build()

      pendingPromise = promise
      GmsDocumentScanning.getClient(scannerOptions)
        .getStartScanIntent(activity)
        .addOnSuccessListener { intentSender ->
          try {
            activity.startIntentSenderForResult(intentSender, REQUEST_SCAN, null, 0, 0, 0)
          } catch (error: Exception) {
            rejectPending("ERR_START_SCAN", error.message ?: "No se pudo abrir el escáner", error)
          }
        }
        .addOnFailureListener { error ->
          rejectPending("ERR_START_SCAN", error.message ?: "No se pudo abrir el escáner", error)
        }
    }

    OnActivityResult { _, (requestCode, resultCode, intent) ->
      if (requestCode != REQUEST_SCAN) return@OnActivityResult
      if (resultCode == Activity.RESULT_CANCELED) {
        pendingPromise?.resolve(mapOf("cancelled" to true, "engine" to "mlkit", "pages" to emptyList<Any>()))
        pendingPromise = null
        return@OnActivityResult
      }
      if (resultCode != Activity.RESULT_OK) {
        rejectPending("ERR_SCAN_FAILED", "El escáner terminó con código $resultCode", null)
        return@OnActivityResult
      }

      try {
        val result = GmsDocumentScanningResult.fromActivityResultIntent(intent)
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

    OnDestroy {
      rejectPending("ERR_SCANNER_DESTROYED", "El escáner se cerró antes de terminar", null)
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
    pendingPromise?.reject(code, message, cause)
    pendingPromise = null
  }

  companion object {
    private const val REQUEST_SCAN = 48112
  }
}
