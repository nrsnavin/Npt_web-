import { Component } from 'react';
import { isChunkMissing } from '../utils/lazyPage.js';

/**
 * The last line, for when a screen throws while drawing itself.
 *
 * React's rule is that an error thrown during render unmounts the whole tree unless something
 * above it catches. With nothing above it, the app did exactly that: a single bad expression in
 * one form — `error.details.map` on a refusal whose details were an object — took every pixel
 * with it. A white page. Not an error message, not a blank list: nothing at all, with whatever
 * the person had spent ten minutes typing still in the fields underneath it.
 *
 * That is the worst shape a failure can take in a plant. It is indistinguishable from the tablet
 * dying, so the response is to reload — which is also the one action that guarantees the typing
 * is gone. And it says nothing anybody can repeat to whoever fixes it.
 *
 * The specific bug is fixed where it was. This is here because the next one has not been written
 * yet, and one component's mistake should cost one component.
 *
 * A class, because `componentDidCatch` has no hook equivalent — this is the one place in the app
 * that cannot be a function.
 *
 * **Reset on navigation.** A boundary that has caught stays caught until its state is cleared,
 * so without `resetKey` a screen that failed once would keep showing its apology after the
 * person had navigated somewhere else entirely. The route is passed in as the key by the layout.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: null };
  }

  static getDerivedStateFromError(failed) {
    return { failed };
  }

  componentDidCatch(failed, info) {
    /* Kept in the console rather than swallowed: it is the only copy of the stack, and the
       person reading it is whoever has been asked why the screen went blank. */
    console.error('A screen failed while drawing itself', failed, info?.componentStack);
  }

  componentDidUpdate(previous) {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: null });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;

    /*
     * A screen whose *code* never arrived is a different failure from a screen that threw, and
     * the generic apology gives it exactly the wrong advice: "try this screen again" refetches
     * a file that is genuinely not on the server and fails the same way every time.
     *
     * `lazyPage` has already spent its one reload by the time anything reaches here, so this
     * branch is the case where reloading did not help — the tab needs replacing, or the deploy
     * left a file behind. Said plainly, because the alternative is somebody pressing a button
     * that cannot work until they give up on the app.
     */
    const missing = isChunkMissing(this.state.failed)
      || isChunkMissing(this.state.failed?.cause);

    return (
      <div className="card animate-fade-up mx-auto my-10 max-w-lg p-8 text-center">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-danger-500/15 text-lg text-danger-400 ring-1 ring-inset ring-danger-500/25">
          !
        </div>
        <p className="text-base font-bold tracking-tight text-steel-50">
          {missing ? 'This screen’s code could not be fetched' : 'This screen could not be drawn'}
        </p>
        <p className="mt-2 text-sm text-steel-400">
          {missing ? (
            <>
              The app was most likely updated while this tab was open. Nothing has been lost on
              the server. Close the tab and open the app again — if that does not fix it, a file
              is missing from the last deploy and somebody needs to look at it.
            </>
          ) : (
            <>
              Nothing you did caused it and nothing has been lost on the server — the last thing
              you saved is saved. Anything typed on this screen and not yet saved is gone, so
              check before entering it again.
            </>
          )}
        </p>
        {/* The sentence somebody can read down a phone. Without it the only report possible is
            "it went white", which is not something anybody can act on. */}
        <p className="mt-3 break-words rounded-lg bg-line/[0.04] px-3 py-2 text-xs text-steel-500">
          {String(this.state.failed?.message || this.state.failed) || 'No message'}
        </p>
        <div className="mt-5 flex justify-center gap-2">
          {/* Not offered for a missing file: it refetches what is not there. */}
          {!missing && (
            <button type="button" className="btn-secondary" onClick={() => this.setState({ failed: null })}>
              Try this screen again
            </button>
          )}
          <button type="button" className="btn-primary" onClick={() => window.location.assign('/')}>
            Back to the home screen
          </button>
        </div>
      </div>
    );
  }
}
