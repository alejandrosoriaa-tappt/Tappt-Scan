import ExpoModulesCore
import VisionKit
import UIKit

public final class TapptDocumentScannerModule: Module {
  private var pendingPromise: Promise?
  private var scannerDelegate: TapptDocumentScannerDelegate?

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
      let scannerDelegate = TapptDocumentScannerDelegate(owner: self)
      self.scannerDelegate = scannerDelegate
      controller.delegate = scannerDelegate
      presenter.present(controller, animated: true)
    }.runOnQueue(.main)

    OnDestroy {
      self.pendingPromise?.reject("ERR_SCANNER_DESTROYED", "El escáner se cerró antes de terminar")
      self.pendingPromise = nil
      self.scannerDelegate = nil
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
        // VisionKit conserva internamente todas las páginas de resolución de
        // cámara. Crear además un JPEG al 95 % de cada original provoca picos
        // de memoria capaces de hacer que iOS mate la app. Para PDF y OCR,
        // 2400 px y calidad 0.82 preservan texto fino sin duplicar el sensor.
        let image = resizedForDocument(scan.imageOfPage(at: index), maxDimension: 2400)
        guard let data = image.jpegData(compressionQuality: 0.82) else {
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
        self.scannerDelegate = nil
      }
    } catch {
      finishWithError(controller, code: "ERR_SAVE_SCAN", message: error.localizedDescription)
    }
  }

  private func resizedForDocument(_ image: UIImage, maxDimension: CGFloat) -> UIImage {
    let largest = max(image.size.width, image.size.height)
    guard largest > maxDimension else { return image }

    let scale = maxDimension / largest
    let target = CGSize(
      width: max(1, floor(image.size.width * scale)),
      height: max(1, floor(image.size.height * scale))
    )
    let format = UIGraphicsImageRendererFormat.default()
    format.scale = 1
    format.opaque = true
    return UIGraphicsImageRenderer(size: target, format: format).image { _ in
      image.draw(in: CGRect(origin: .zero, size: target))
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
      self.scannerDelegate = nil
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
      self.scannerDelegate = nil
    }
  }
}

private final class TapptDocumentScannerDelegate: NSObject, VNDocumentCameraViewControllerDelegate {
  private weak var owner: TapptDocumentScannerModule?

  init(owner: TapptDocumentScannerModule) {
    self.owner = owner
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
