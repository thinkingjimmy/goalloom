package expo.modules.continuereturnkey

import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ContinueReturnKeyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ContinueReturnKey")

    Function("applyContinueReturnKey") { label: String ->
      val activity = appContext.currentActivity ?: return@Function
      val field = activity.currentFocus as? EditText ?: return@Function
      val action = EditorInfo.IME_ACTION_GO
      field.setImeActionLabel(label, action)
      val cleared = field.imeOptions and EditorInfo.IME_MASK_ACTION.inv()
      if (field.imeOptions != cleared or action) {
        field.imeOptions = cleared or action
        activity.getSystemService(InputMethodManager::class.java)?.restartInput(field)
      }
    }
  }
}
