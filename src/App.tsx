import { AppRoutes } from './routes/AppRoutes';
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      <div className="w-screen h-screen overflow-hidden select-none">
        <AppRoutes />
      </div>
    </ErrorBoundary>
  );
}

export default App;
