#!/usr/bin/env python3
"""Sprint retrospective data for the Mountain Hut project, from YouTrack and the test results.

Usage:
  python retro_report.py                      choose the sprint from a list
  python retro_report.py --sprint "Sprint 2"  report of one sprint

Environment variables: YOUTRACK_URL, YOUTRACK_TOKEN, YOUTRACK_PROJECT.
The names of the YouTrack fields are the constants at the top of this file.
"""

import argparse
import json
import os
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

import requests
from tabulate import tabulate


def env(name):
    value = os.environ.get(name)
    if not value:
        sys.exit(f"Set the environment variable {name}.")
    return value


# Agile board that contains the sprints.
BOARD = "Mountain Hut Project Development"

# Names of the YouTrack fields: change them here if yours are different.
STATE = "State"
DONE_STATES = ["Done"]
ESTIMATION = "Estimation"
STORY_POINTS = "Story points"  # an issue with story points is a user story

BOARD_FIELDS = "id,name,projects(shortName),sprints(id,name,start,finish)"
ISSUE_FIELDS = "idReadable,summary,customFields(name,value(name,minutes)),parent(issues(idReadable)),subtasks(issues(idReadable))"


# --------------------------------------------------------------------- YouTrack API

class YouTrack:
    def __init__(self):
        self.base = env("YOUTRACK_URL").rstrip("/")
        token = env("YOUTRACK_TOKEN")
        self.session = requests.Session()
        self.session.headers.update({"Authorization": f"Bearer {token}", "Accept": "application/json"})

    def get(self, path, fields, **params):
        try:
            response = self.session.get(f"{self.base}{path}", params={"fields": fields, **params}, timeout=30)
            response.raise_for_status()
        except requests.HTTPError as error:
            sys.exit(f"YouTrack error {error.response.status_code} on {path}: {error.response.text[:300]}")
        except requests.RequestException as error:
            sys.exit(f"Cannot reach YouTrack: {error}")
        return response.json()

    def get_all(self, path, fields, page=200):
        items, skip = [], 0
        while True:
            chunk = self.get(path, fields, **{"$top": page, "$skip": skip})
            items += chunk
            if len(chunk) < page:
                return items
            skip += page

    def board(self):
        project = env("YOUTRACK_PROJECT")
        boards = [b for b in self.get_all("/api/agiles", BOARD_FIELDS)
                  if project in [p["shortName"] for p in b["projects"]]]
        for board in boards:
            if board["name"] == BOARD:
                board["sprints"].sort(key=lambda s: s.get("start") or 0)
                return board
        sys.exit(f"Board '{BOARD}' not found in project {project}. Boards: "
                 + ", ".join(b["name"] for b in boards))

    def sprint_issue_ids(self, board, sprint):
        data = self.get(f"/api/agiles/{board['id']}/sprints/{sprint['id']}", "issues(idReadable)")
        return [i["idReadable"] for i in data["issues"]]

    def issue(self, issue_id):
        return self.get(f"/api/issues/{issue_id}", ISSUE_FIELDS)

    def work_items(self, issue_id):
        """Time logged on the issue: one (work type, person, minutes) entry per work item."""
        items = self.get_all(f"/api/issues/{issue_id}/timeTracking/workItems",
                             "duration(minutes),type(name),author(login,fullName)")
        return [((i.get("type") or {}).get("name") or "(no type)",
                 person_name(i.get("author")),
                 (i.get("duration") or {}).get("minutes") or 0) for i in items]

    def team(self):
        """Names of the project team members, or None if the team cannot be read."""
        try:
            users = self.get_all(f"/api/admin/projects/{env('YOUTRACK_PROJECT')}/team/users", "login,fullName")
        except SystemExit:
            return None
        return [person_name(u) for u in users]


# ---------------------------------------------------------------------- issue model

def field(raw, name):
    for f in raw["customFields"]:
        if f["name"] == name:
            return f["value"]
    return None


def person_name(user):
    user = user or {}
    return user.get("fullName") or user.get("login") or "(unknown)"


def name_of(value):
    if isinstance(value, dict):
        return value.get("name") or value.get("presentation")
    if isinstance(value, list):
        return ", ".join(filter(None, map(name_of, value))) or None
    return None if value is None else str(value)


class Issue:
    def __init__(self, raw, in_sprint, work_items):
        self.id = raw["idReadable"]
        self.title = raw["summary"]
        self.in_sprint = in_sprint
        self.state = name_of(field(raw, STATE)) or "-"
        self.points = field(raw, STORY_POINTS)
        self.est = (field(raw, ESTIMATION) or {}).get("minutes") or 0
        self.work = {}                    # minutes logged per work type
        self.people = {}                  # minutes logged per person
        for work_type, person, minutes in work_items:
            self.work[work_type] = self.work.get(work_type, 0) + minutes
            self.people[person] = self.people.get(person, 0) + minutes
        self.act = sum(self.work.values())  # total minutes logged
        parents = [i["idReadable"] for i in raw["parent"]["issues"]]
        self.parent = parents[0] if parents else None
        self.children = [i["idReadable"] for i in raw["subtasks"]["issues"]]
        self.is_story = self.points is not None

    @property
    def done(self):
        return self.state.lower() in [s.lower() for s in DONE_STATES]


def load(yt, sprint_ids):
    """Sprint issues with all their subtasks, plus their ancestors (to find the parent story)."""
    raw = {}
    # 1. Down: the issues on the board and all their subtasks
    queue = list(sprint_ids)
    while queue:
        issue_id = queue.pop()
        if issue_id not in raw:
            raw[issue_id] = yt.issue(issue_id)
            queue += [i["idReadable"] for i in raw[issue_id]["subtasks"]["issues"]]
    # 2. Up: the parents, without their other subtasks (they may belong to other sprints)
    queue = [p["idReadable"] for r in raw.values() for p in r["parent"]["issues"]]
    while queue:
        issue_id = queue.pop()
        if issue_id not in raw:
            raw[issue_id] = yt.issue(issue_id)
            queue += [p["idReadable"] for p in raw[issue_id]["parent"]["issues"]]
    issues = {i: Issue(r, i in sprint_ids, yt.work_items(i)) for i, r in raw.items()}
    for issue in issues.values():
        issue.children = sorted((c for c in issue.children if c in issues), key=sort_key)
    return issues


# --------------------------------------------------------------------- calculations

class Sprint:
    def __init__(self, issues):
        self.issues = issues
        in_scope = {i for i, issue in issues.items() if issue.in_sprint or self._in_sprint_tree(issue)}
        # A story is in scope if it is on the board or one of its tasks is.
        in_scope |= {self._story_of(issues[i]).id for i in in_scope if self._story_of(issues[i])}
        self.in_scope = in_scope
        self.stories = sorted((issues[i] for i in in_scope if issues[i].is_story), key=lambda s: sort_key(s.id))
        self.groups = [(s, [issues[c] for c in s.children if c in in_scope]) for s in self.stories]
        uncategorized = [issues[i] for i in in_scope
                         if not issues[i].is_story and self._story_of(issues[i]) is None
                         and issues[i].parent not in in_scope]
        self.groups.append((None, sorted(uncategorized, key=lambda t: sort_key(t.id))))

    def _in_sprint_tree(self, issue):
        """On the board, or a subtask of a task on the board. A story on the board does not
        bring in its tasks: those of other sprints must not be counted again."""
        while issue and not issue.is_story:
            if issue.in_sprint:
                return True
            issue = self.issues.get(issue.parent)
        return False

    def _story_of(self, issue):
        while issue:
            if issue.is_story:
                return issue
            issue = self.issues.get(issue.parent)
        return None

    def leaves(self, issue):
        if not issue.children:
            return [issue]
        return [leaf for c in issue.children for leaf in self.leaves(self.issues[c])]

    def descendants(self, issue):
        return [d for c in issue.children for d in [c] + self.descendants(self.issues[c])]

    def all_leaves(self, tasks):
        """All the tasks without subtasks and the subtasks, estimated or not."""
        return [leaf for t in tasks for leaf in self.leaves(t)]

    def units(self, tasks):
        """The tasks used in the calculations: the leaves with an estimation."""
        return [leaf for leaf in self.all_leaves(tasks) if leaf.est]

    @property
    def all_units(self):
        return [u for _, tasks in self.groups for u in self.units(tasks)]


def sort_key(issue_id):
    prefix, _, number = issue_id.partition("-")
    return prefix, int(number) if number.isdigit() else 0


def sums(units):
    done = [u for u in units if u.done]
    return [sum(u.est for u in units), sum(u.act for u in units),
            sum(u.est for u in done), sum(u.act for u in done)]


def error_ratio(units):
    """Total task estimation error ratio: sum(spent) / sum(estimation) - 1."""
    estimated = sum(u.est for u in units)
    return sum(u.act for u in units) / estimated - 1 if estimated else None


def absolute_error(units):
    """Absolute relative task estimation error: mean of |spent / estimation - 1|."""
    return statistics.mean(abs(u.act / u.est - 1) for u in units) if units else None


NO_TIME = "(no time logged)"


def per_work_type(units):
    """Estimated and logged minutes per work type.

    YouTrack has one estimation per task, not per work type: the estimation of a task is split
    among its work types in proportion to the time logged on each. A task with no time logged
    has no work type, so its estimation goes to NO_TIME."""
    est, act = {}, {}
    for u in units:
        if u.act:
            for work_type, minutes in u.work.items():
                est[work_type] = est.get(work_type, 0) + u.est * minutes / u.act
                act[work_type] = act.get(work_type, 0) + minutes
        else:
            est[NO_TIME] = est.get(NO_TIME, 0) + u.est
            act[NO_TIME] = act.get(NO_TIME, 0)
    return est, act


# ----------------------------------------------------------------------- formatting

def hours(minutes):
    if minutes is None:
        return "-"
    hours_, rest = divmod(round(minutes), 60)
    return f"{hours_}h {rest:02d}m"


def ratio(value):
    return "-" if value is None else f"{value:.2f}"


def cell(text):
    return str(text).replace("|", "\\|")


def table(rows, headers):
    return tabulate(rows, headers=headers, tablefmt="github", disable_numparse=True)


def task_rows(sprint, task, depth=0):
    if task.children:
        est, act = (f"Σ {hours(m)}" for m in sums([l for l in sprint.leaves(task) if l.est])[:2])
    elif not task.est:
        est, act = "not estimated", hours(task.act)
    else:
        est, act = hours(task.est), hours(task.act)
    indent = "↳ " * depth
    rows = [[indent + task.id, cell(task.title), task.state, len(task.children) or "-", est, act]]
    for child in task.children:
        rows += task_rows(sprint, sprint.issues[child], depth + 1)
    return rows


def warnings(sprint):
    notes = []
    for story, tasks in sprint.groups:
        units = sprint.all_leaves(tasks)
        if story:
            open_units = [u.id for u in units if not u.done]
            if not story.in_sprint:
                notes.append(f"{story.id} is not on the sprint board, but some of its tasks are.")
            if story.done and open_units:
                notes.append(f"{story.id} is {story.state} but has open tasks: {', '.join(open_units)}.")
            if not story.done and units and not open_units:
                notes.append(f"{story.id} is {story.state} but all its tasks are done.")
            if not tasks:
                notes.append(f"{story.id} has no tasks.")
            if story.act:
                notes.append(f"{hours(story.act)} logged directly on story {story.id}: not counted.")
        for issue in tasks + [sprint.issues[d] for t in tasks for d in sprint.descendants(t)]:
            leaves_est = sum(leaf.est for leaf in sprint.leaves(issue))
            if issue.children and (issue.act or (issue.est and issue.est != leaves_est)):
                notes.append(f"{issue.id} has subtasks and its own estimation/time "
                             f"({hours(issue.est)} / {hours(issue.act)}): not counted.")
        for unit in units:
            if not unit.est:
                notes.append(f"{unit.id} has no estimation: not counted in the calculations.")
            if unit.done and not unit.act:
                notes.append(f"{unit.id} is done with no time logged.")
    return notes


def tests_section(directory):
    d = Path(directory) if directory else None
    if not d or not d.is_dir():
        return "_Tests not run._"

    def read(name):
        path = d / name
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None

    def coverage(name):
        data = read(f"{name}/coverage-summary.json")
        return f"{data['total']['lines']['pct']:.1f}%" if data else "-"

    rows = []
    for suite in ("unit", "integration"):
        r = read(f"{suite}.json")
        if r:
            rows.append([suite, r["numTotalTests"], r["numPassedTests"], r["numFailedTests"],
                         r.get("numPendingTests", 0) + r.get("numTodoTests", 0), coverage(f"{suite}-coverage")])
    e2e = read("e2e.json")
    if e2e:
        s = e2e["stats"]
        passed = s["expected"] + s["flaky"]
        rows.append(["e2e", passed + s["unexpected"] + s["skipped"], passed, s["unexpected"], s["skipped"], "-"])
    if not rows:
        return "_No test results found._"
    ref = (d / "ref.txt").read_text().strip() if (d / "ref.txt").exists() else "?"
    return f"Code tested: `{ref}`\n\n" + table(
        rows, ["Suite", "Tests", "Passed", "Failed", "Skipped", "Line coverage"])


def sprint_dates(info):
    """Start and end date of the sprint as text, and its length in weeks (None if unknown)."""
    start, finish = info.get("start"), info.get("finish")
    if not start or not finish:
        return "unknown", None
    day = lambda ms: datetime.fromtimestamp(ms / 1000, tz=timezone.utc).date().isoformat()
    return f"{day(start)} → {day(finish)}", (finish - start) / (7 * 24 * 3600 * 1000)


def render(info, sprint, tests_dir, team):
    dates, weeks = sprint_dates(info)
    md = [f"# Sprint data report: {info['name']}",
          f"Sprint dates: {dates}" + (f" ({weeks:.1f} weeks)." if weeks else "."),
          f"Project: {env('YOUTRACK_PROJECT')}. Done states: {', '.join(DONE_STATES)}. "
          "Hours marked with Σ are the sum of the subtasks. "
          "Tasks without estimation are listed but not counted in any calculation (see Warnings)."]

    # 1. Stories, tasks and subtasks
    md.append("## 1. User stories, tasks and subtasks")
    for story, tasks in sprint.groups:
        n_sub = sum(len(sprint.descendants(t)) for t in tasks)
        if story:
            md.append(f"### {story.id} {cell(story.title)}\n\nStory points: {story.points} · "
                      f"State: **{story.state}** · Tasks: {len(tasks)} · Subtasks: {n_sub}")
        else:
            md.append(f"### Uncategorized\n\nTasks: {len(tasks)} · Subtasks: {n_sub}")
        rows = [row for t in tasks for row in task_rows(sprint, t)]
        md.append(table(rows, ["ID", "Title", "State", "Subtasks", "Est.", "Actual"])
                  if rows else "_No tasks._")

    # 2. Stories committed vs done
    stories = sprint.stories
    done = [s for s in stories if s.done]
    pts_all, pts_done = sum(s.points for s in stories), sum(s.points for s in done)
    md.append("## 2. Stories committed vs done")
    md.append(table([["Committed", len(stories), pts_all],
                     ["Done", len(done), pts_done],
                     ["Not done", len(stories) - len(done), pts_all - pts_done]],
                    ["", "Stories", "Story points"]))
    if len(done) < len(stories):
        md.append("Not done: " + ", ".join(f"{s.id} ({s.state})" for s in stories if not s.done))

    # 3. Hours per story
    rows = []
    total_tasks = total_subtasks = 0
    for story, tasks in sprint.groups:
        name = f"{story.id} {cell(story.title)}" if story else "Uncategorized"
        n_sub = sum(len(sprint.descendants(t)) for t in tasks)
        total_tasks += len(tasks)
        total_subtasks += n_sub
        rows.append([name, story.points if story else "-", story.state if story else "-", len(tasks), n_sub]
                    + [hours(m) for m in sums(sprint.units(tasks))])
    rows.append(["**Total**", f"**{pts_all}**", "", f"**{total_tasks}**", f"**{total_subtasks}**"]
                + [f"**{hours(m)}**" for m in sums(sprint.all_units)])
    md.append("## 3. Hours per user story")
    md.append(table(rows, ["Story", "SP", "State", "Tasks", "Subtasks",
                           "Est. (all)", "Actual (all)", "Est. (done)", "Actual (done)"]))

    # 4-6. Totals, statistics, estimation error
    units = sprint.all_units
    sets = [("All tasks", units), ("Done tasks only", [u for u in units if u.done])]
    rows = []
    for label, s in sets:
        est, act = [u.est for u in s] or [0], [u.act for u in s] or [0]
        rows.append([label, len(s), hours(sum(est)), hours(sum(act)),
                     hours(statistics.mean(est)), hours(statistics.pstdev(est)),
                     hours(statistics.mean(act)), hours(statistics.pstdev(act))])
    md.append("## 4. Total hours, mean and standard deviation")
    md.append(table(rows, ["", "Tasks", "Estimated", "Actual", "Est. mean", "Est. std dev",
                           "Actual mean", "Actual std dev"]))
    md.append("Standard deviation: population, over tasks without subtasks and subtasks.")

    rows = [[label, ratio(error_ratio(s)), ratio(absolute_error(s))] for label, s in sets]
    md.append("## 5. Estimation error")
    md.append(table(rows, ["", "Total error ratio", "Absolute relative error"]))
    md.append("- Total task estimation error ratio = Σ spent / Σ estimation − 1 "
              "(positive = more time than estimated, negative = less)\n"
              "- Absolute relative task estimation error = (1/n) Σ |spent / estimation − 1|")

    # 6. Quality measures
    est_all, act_all = per_work_type(units)
    est_done, act_done = per_work_type([u for u in units if u.done])
    total_act = sum(act_all.values())
    rows = [[t, hours(est_all[t]), hours(act_all[t]), hours(est_done.get(t, 0)), hours(act_done.get(t, 0)),
             f"{act_all[t] / total_act:.0%}" if total_act else "-"]
            for t in sorted(est_all, key=lambda t: (t == NO_TIME, t))]
    rows.append(["**Total**"] + [f"**{hours(sum(d.values()))}**" for d in (est_all, act_all, est_done, act_done)]
                + ["**100%**" if total_act else "-"])
    md.append("## 6. Quality measures")
    md.append("### Hours per work type")
    md.append(table(rows, ["Work type", "Est. (all)", "Actual (all)", "Est. (done)", "Actual (done)",
                           "Share of the actual"]) if units else "_No tasks._")
    md.append("YouTrack has one estimation per task, not per work type: the estimation of each task is split "
              "among its work types in proportion to the time logged on each. "
              f"Tasks with no time logged are in \"{NO_TIME}\".")
    md.append("### Automated tests")
    md.append(tests_section(tests_dir))

    # 7. Time logged per person
    logged = {}
    for issue_id in sprint.in_scope:
        for person, minutes in sprint.issues[issue_id].people.items():
            logged[person] = logged.get(person, 0) + minutes
    total = sum(logged.values())
    people = sorted(set(logged) | set(team or []), key=lambda p: (-logged.get(p, 0), p))
    rows = [[p, hours(logged.get(p, 0)),
             hours(logged.get(p, 0) / weeks) if weeks else "-",
             f"{logged.get(p, 0) / total:.0%}" if total else "-"] for p in people]
    md.append("## 7. Time logged per person")
    md.append(table(rows, ["Person", "Logged", "Per week", "Share of the total"]) if rows else "_No time logged._")
    md.append("All the time logged on the issues of the sprint, including the tasks not counted in the "
              "other sections." + ("" if team is not None else
                                   " The project team could not be read: only the people who logged time are listed."))

    # Warnings
    notes = warnings(sprint)
    md.append("## Warnings")
    md.append("\n".join(f"- {n}" for n in notes) if notes else "None.")
    return "\n\n".join(md) + "\n"


# --------------------------------------------------------------------------- main

def choose_sprint(board, name):
    sprints = board["sprints"]
    if name:
        for sprint in sprints:
            if sprint["name"] == name:
                return sprint
        sys.exit(f"Sprint '{name}' not found. Sprints: {', '.join(s['name'] for s in sprints)}")
    if not sys.stdin.isatty():
        sys.exit("Pass --sprint. Sprints: " + ", ".join(s["name"] for s in sprints))
    for number, sprint in enumerate(sprints, 1):
        print(f"  {number}. {sprint['name']}")
    choice = input("Sprint number: ")
    if not choice.isdigit() or not 1 <= int(choice) <= len(sprints):
        sys.exit("Invalid choice.")
    return sprints[int(choice) - 1]


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--sprint", help="sprint name; if omitted, choose it from a list")
    parser.add_argument("--tests-dir", help="folder with the test results")
    parser.add_argument("--out", default="retro-report", help="output folder")
    args = parser.parse_args()

    yt = YouTrack()
    board = yt.board()
    sprint = choose_sprint(board, args.sprint)
    issues = load(yt, set(yt.sprint_issue_ids(board, sprint)))
    report = render(sprint, Sprint(issues), args.tests_dir, yt.team())

    out = Path(args.out)
    out.mkdir(exist_ok=True)
    slug = "-".join(sprint["name"].lower().split())
    (out / f"{slug}-data.md").write_text(report, encoding="utf-8")
    (out / f"{slug}-data.json").write_text(
        json.dumps([vars(i) for i in issues.values()], indent=2, ensure_ascii=False), encoding="utf-8")
    print(report)


if __name__ == "__main__":
    main()