/**
 * One login, several departments, on screen [server: utils/departments.js].
 *
 *   node --test tests/multi-department.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');

test('an admin sets the main department and the ones a person also works in', () => {
  const users = read('pages/Users.jsx');
  assert.match(users, /function AlsoWorksIn/);
  assert.match(users, /extraDepartments: extras\.filter\(\(key\) => key !== values\.department\)/, 'on a new account');
  assert.match(users, /usersApi\.update\(\{ id: user\.id, department: main \|\| undefined, extraDepartments:/, 'and on an existing one');
});

test('task rights and desks follow every department the person works in', () => {
  assert.match(read('context/AuthContext.jsx'), /worksIn\(key\)/);
  assert.match(read('components/HandoffTaskList.jsx'), /worksIn\(task\.department\)/);
  assert.match(read('components/DepartmentDesk.jsx'), /worksIn\(task\.department\)/);
  assert.match(read('pages/DepartmentDashboard.jsx'), /otherDesks\.map/);
});

test('asking a question still offers every department, not just the asker’s own', () => {
  assert.doesNotMatch(read('components/OrderQueries.jsx'), /user\?\.departments \|\|/);
});
