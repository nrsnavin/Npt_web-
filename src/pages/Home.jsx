import { lazy } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Dashboard from './Dashboard.jsx';

const SampleHome = lazy(() => import('./SampleHome.jsx'));
const ProductionHome = lazy(() => import('./ProductionHome.jsx'));
const DispatchHome = lazy(() => import('./DispatchHome.jsx'));
const PaymentsHome = lazy(() => import('./PaymentsHome.jsx'));

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
 * Production's is the same argument with a different answer. A press supervisor is not chased
 * by follow-up dates either; they are chased by what will miss its date, and by the marketing
 * person who asked a question this morning and has a buyer waiting on it. So that screen leads
 * with those two and nothing else — the full line register is a click away, and is a different
 * tool, for looking something up rather than deciding what to do now.
 *
 * Despatch's is the same argument again with a third answer, and the grouping is the whole of
 * it: a press queue can be ranked by how bad each line is, because everything on it is the same
 * work. A yard cannot — chasing a transporter, chasing an invoice and loading a lorry are three
 * unrelated jobs, so its screen groups by what to *do* rather than by severity.
 *
 * Accounts still falls through to My day, deliberately. It has the same argument waiting and a
 * different screen to make it with, and inventing a mapping before that screen exists would be
 * a guess. Department by department, as each one's own view is built.
 */
const HOME_BY_DEPARTMENT = {
  sampling: () => <SampleHome />,
  production: () => <ProductionHome />,
  despatch: () => <DispatchHome />,
  /* The follow-up team's whole job is the chase, so it is their front page rather than a
     screen they navigate to. Marketing keeps the general dashboard and reaches payments from
     the nav — chasing is part of their day, not the whole of it. */
  accounts: () => <PaymentsHome />,
};

export default function Home() {
  const { user } = useAuth();
  const own = HOME_BY_DEPARTMENT[user?.department];

  return own ? own() : <Dashboard />;
}
