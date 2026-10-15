Pod::Spec.new do |s|
  s.name           = 'ContinueReturnKey'
  s.version        = '1.0.0'
  s.summary        = 'Maps the onboarding return key to UIReturnKeyType.continue'
  s.homepage       = 'https://github.com/thinkingjimmy/goalloom'
  s.license        = 'MIT'
  s.author         = 'Goalloom'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.source_files = 'ios/**/*.{h,m,mm,swift}'
end
