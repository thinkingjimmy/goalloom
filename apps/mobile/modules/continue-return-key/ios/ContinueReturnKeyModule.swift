import ExpoModulesCore
import ObjectiveC
import UIKit

private var stickContinueKey: UInt8 = 0
private var didSwizzleReturnKey = false
private let returnKeySetter = #selector(setter: UITextField.returnKeyType)

/// ObjC IMP of `UITextField.setReturnKeyType:`, captured before it is replaced.
/// A Swift call to the swapped selector would recurse: Swift dispatches that
/// method directly and never sees the exchanged implementation.
private typealias ReturnKeySetter = @convention(c) (UITextField, Selector, UIReturnKeyType) -> Void
private var originalSetReturnKey: ReturnKeySetter?

extension UITextField {
  var goalloomStickContinue: Bool {
    get { (objc_getAssociatedObject(self, &stickContinueKey) as? Bool) ?? false }
    set { objc_setAssociatedObject(self, &stickContinueKey, newValue, .OBJC_ASSOCIATION_RETAIN_NONATOMIC) }
  }

  @objc func goalloom_setReturnKeyType(_ type: UIReturnKeyType) {
    let next: UIReturnKeyType = goalloomStickContinue ? .continue : type
    originalSetReturnKey?(self, returnKeySetter, next)
  }
}

public class ContinueReturnKeyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ContinueReturnKey")

    Function("applyContinueReturnKey") { (_ label: String) in
      DispatchQueue.main.async {
        ContinueReturnKeyModule.swizzleReturnKey()
        guard let field = ContinueReturnKeyModule.textField() else { return }
        field.goalloomStickContinue = true
        field.returnKeyType = .continue
        field.reloadInputViews()
      }
    }
  }

  private static func swizzleReturnKey() {
    if didSwizzleReturnKey { return }
    guard
      let original = class_getInstanceMethod(UITextField.self, returnKeySetter),
      let swapped = class_getInstanceMethod(UITextField.self, #selector(UITextField.goalloom_setReturnKeyType))
    else { return }
    originalSetReturnKey = unsafeBitCast(method_getImplementation(original), to: ReturnKeySetter.self)
    method_setImplementation(original, method_getImplementation(swapped))
    didSwizzleReturnKey = true
  }

  private static func textField() -> UITextField? {
    if let field = UIResponder.currentFirst as? UITextField { return field }
    let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
    for scene in scenes {
      for window in scene.windows {
        if let field = find(in: window) { return field }
      }
    }
    return nil
  }

  private static func find(in view: UIView) -> UITextField? {
    if let field = view as? UITextField, field.isFirstResponder { return field }
    for child in view.subviews {
      if let found = find(in: child) { return found }
    }
    return nil
  }
}

private extension UIResponder {
  static var currentFirst: UIResponder? {
    FirstResponderCapture.current = nil
    UIApplication.shared.sendAction(#selector(UIResponder.goalloomCaptureFirstResponder), to: nil, from: nil, for: nil)
    return FirstResponderCapture.current
  }

  @objc func goalloomCaptureFirstResponder() {
    FirstResponderCapture.current = self
  }
}

private enum FirstResponderCapture {
  static weak var current: UIResponder?
}
