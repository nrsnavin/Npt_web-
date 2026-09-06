import { lazy } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Dashboard from './Dashboard.jsx';

const SampleHome = lazy(() => import('./SampleHome.jsx'));

/**
 * What somebody sees when they open the app.
 *
 * **My day is a marketing screen wearing a neutral name.** Its four tiles count overdue tasks,
 * tasks due today, tasks due tomorrow and open tasks — and tasks are how work reaches a
 * marketing person, who is chased by follow-up dates. They are not how work reaches a sample
 * bench: a request lands on the bench because a buyer asked for it, and the bench's day is the
 * queue, not a to-do list. A sampling user opening My day saw four zeroes and an empty panel
 * every morning, which teaches somebody that the home screen is not worth opening.
 *
 * So home is chosen by department rather than being one screen for everyone. Chosen here, at
 * the route, rather than with a redirect: a redirect would leave the Home rail unlit on their
 * own home page and hand them a back button that goes nowhere useful.
 *
 * The sampling home is deliberately *not* the sampling dashboard. That was the first attempt
 * and it was worse than My day, not better: seven stat tiles, four tables and two paragraphs
 * about turnaround, in front of somebody who had opened the app to find out which hanger to
 * make next. A screen answers one question or it answers none.
 *
 * Only sampling for now, deliberately. Production, despatch and accounts each have the same
 * argument waiting to be made and a different screen to make it with, and inventing a mapping
 * before those screens exist would be a table of guesses. Department by department, as each
 * one's own view is built.
 */
const HOME_BY_DEPARTMENT = {
  sampling: () => <SampleHome />,
};

export default function Home() {
  const { user } = useAuth();
  const own = HOME_BY_DEPARTMENT[user?.department];

  return own ? own() : <Dashboard />;
}
