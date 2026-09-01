Pod::Spec.new do |s|
  s.name           = 'TapptDocumentScanner'
  s.version        = '0.1.0'
  s.summary        = 'VisionKit document scanner bridge for TapptScan'
  s.description    = 'Presents VNDocumentCameraViewController and returns cached JPEG pages.'
  s.author         = 'Tappt'
  s.homepage       = 'https://tappt.lat'
  s.platforms      = { :ios => '13.0' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = '**/*.{h,m,mm,swift}'
  s.frameworks     = 'VisionKit'
  s.swift_version  = '5.4'
end
