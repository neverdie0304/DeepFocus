import { Component } from 'react';

/**
 * Catches uncaught exceptions thrown during rendering in the component tree
 * below it, logs them to the console, and displays a minimal fallback UI
 * instead of a blank white screen.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <App />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface to the browser console so the error is still debuggable.
    // eslint-disable-next-line no-console
    console.error('Uncaught error in component tree:', error, info);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-gray-950 text-gray-200 flex items-center justify-center p-6">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-bold">Something went wrong.</h1>
            <p className="text-sm text-gray-400">
              The page hit an unexpected error. No data has been lost. Try reloading
              to recover.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm px-5 py-2 rounded"
            >
              Reload
            </button>
            {this.state.error?.message && (
              <pre className="text-xs text-gray-600 whitespace-pre-wrap mt-4">
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
