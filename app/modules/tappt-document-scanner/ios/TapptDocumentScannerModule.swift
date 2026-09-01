import ExpoModulesCore
import VisionKit

public final class TapptDocumentScannerModule: Module, VNDocumentCameraViewControllerDelegate {
  private var pendingPromise: Promise?

  public func definition() -> ModuleDefinition {
    Name("TapptDocumentScanner")

    AsyncFunction("scan") { (_: [String: Any], promise: Promise) in
      guard VNDocumentCameraViewController.isSupported else {
        promise.reject("ERR_SCANNER_UNAVAILABLE", "VisionKit no está disponible en este dispositivo")
        return
      }
      guard self.pendingPromise == nil else {
        promise.reject("ERR_SCANNER_BUSY", "Ya hay un escaneo en curso")
        return
      }
      guard let presenter = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_NO_VIEW_CONTROLLER", "No se encontró una pantalla para abrir el escáner")
        return
      }

      self.pendingPromise = promise
      let controller = VNDocumentCameraViewController()
      controller.delegate = self
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)

    OnDestroy {
      self.pendingPromise?.reject("ERR_SCANNER_DESTROYED", "El escáner se cerró antes de terminar")
      self.pendingPromise = nil
    }
  }

  public func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFinishWith scan: VNDocumentCameraScan
  ) {
    do {
      let folder = FileManager.default.temporaryDirectory
        .appendingPathComponent("tapptscan-\(UUID().uuidString)", isDirectory: true)
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)

      var pages: [[String: Any]] = []
      for index in 0..<scan.pageCount {
        let image = scan.imageOfPage(at: index)
        guard let data = image.jpegData(compressionQuality: 0.95) else {
          throw NSError(domain: "TapptDocumentScanner", code: 2, userInfo: [
            NSLocalizedDescriptionKey: "No se pudo convertir la página \(index + 1)"
          ])
        }
        let url = folder.appendingPathComponent("page-\(index + 1).jpg")
        try data.write(to: url, options: .atomic)
        pages.append(["uri": url.absoluteString])
      }

      controller.dismiss(animated: true) {
        self.pendingPromise?.resolve([
          "cancelled": false,
          "engine": "visionkit",
          "pages": pages
        ])
        self.pendingPromise = nil
      }
    } catch {
      finishWithError(controller, code: "ERR_SAVE_SCAN", message: error.localizedDescription)
    }
  }

  public func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true) {
      self.pendingPromise?.resolve([
        "cancelled": true,
        "engine": "visionkit",
        "pages": []
      ])
      self.pendingPromise = nil
    }
  }

  public func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFailWithError error: Error
  ) {
    finishWithError(controller, code: "ERR_SCAN_FAILED", message: error.localizedDescription)
  }

  private func finishWithError(
    _ controller: VNDocumentCameraViewController,
    code: String,
    message: String
  ) {
    controller.dismiss(animated: true) {
      self.pendingPromise?.reject(code, message)
      self.pendingPromise = nil
    }
  }
}
