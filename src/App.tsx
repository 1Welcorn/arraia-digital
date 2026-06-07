import { AppRoutes } from './routes/AppRoutes';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InstallPrompt } from './components/InstallPrompt';

function App() {
  return (
    <ErrorBoundary>
      <div className="w-screen h-[100dvh] overflow-hidden select-none relative">
        <AppRoutes />
        <InstallPrompt />
      </div>
    </ErrorBoundary>
  );
}

export default App;
