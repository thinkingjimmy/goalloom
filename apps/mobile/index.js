import './polyfill'
import { registerRootComponent } from 'expo'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import App from './src/root'

function Root() {
  return <SafeAreaProvider><App /></SafeAreaProvider>
}

registerRootComponent(Root)
