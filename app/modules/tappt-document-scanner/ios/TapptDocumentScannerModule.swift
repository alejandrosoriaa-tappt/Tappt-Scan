import ExpoModulesCore
import VisionKit

public final class TapptDocumentScannerModule: Module {
  private var pendingPromise: Promise?
  private lazy var scannerDelegate = TapptDocumentScannerDelegate(owner: self)

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
      controller.delegate = self.scannerDelegate
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)

    OnDestroy {
      self.pendingPromise?.reject("ERR_SCANNER_DESTROYED", "El escáner se cerró antes de terminar")
      self.pendingPromise = nil
    }
  }

  fileprivate func documentCameraViewController(
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

  fileprivate func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    controller.dismiss(animated: true) {
      self.pendingPromise?.resolve([
        "cancelled": true,
        "engine": "visionkit",
        "pages": []
      ])
      self.pendingPromise = nil
    }
  }

  fileprivate func documentCameraViewController(
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

// En Expo SDK 57 `Module` ya no hereda de `NSObject`, mientras que el
// delegado de VisionKit conforma a `NSObjectProtocol`. Mantener el delegado
// UIKit separado evita acoplar el módulo Expo a esa jerarquía de Objective-C.
private final class TapptDocumentScannerDelegate: NSObject, VNDocumentCameraViewControllerDelegate {
  private weak var owner: TapptDocumentScannerModule?

  init(owner: TapptDocumentScannerModule) {
    self.owner = owner
    super.init()
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFinishWith scan: VNDocumentCameraScan
  ) {
    owner?.documentCameraViewController(controller, didFinishWith: scan)
  }

  func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
    owner?.documentCameraViewControllerDidCancel(controller)
  }

  func documentCameraViewController(
    _ controller: VNDocumentCameraViewController,
    didFailWithError error: Error
  ) {
    owner?.documentCameraViewController(controller, didFailWithError: error)
  }
}
