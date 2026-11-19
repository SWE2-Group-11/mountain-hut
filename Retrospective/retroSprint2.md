RETROSPECTIVE SPRINT 2 (Team 11)
=====================================

- [process measures](#process-measures)
- [quality measures](#quality-measures)
- [general assessment](#assessment)

## PROCESS MEASURES 

### Macro statistics

- Number of stories committed vs done : 5 vs 4
  - Done: Change a booking (MH-6), Reserve for an hiker (MH-7), Cancel a booking (MH-8), Repeat a weekly schedule (MH-9)
  - Not done: Define menus (MH-10)
- Total points committed vs done : 24 committed / 19 done
- Nr of hours planned vs spent (as a team) : 97h 10m planned / 96h 59m spent

### Definitions of Done

- Unit tested
- Integration tested
- E2E tested
- Code reviewed (at least one teammate approval on the PR)
- Code pushed on GitHub and merged through `dev` -> `main` with CI passing (lint, type-check, Vitest, Playwright)

### Detailed statistics

| Story                              | # Tasks | Points | Hours est. | Hours actual |
| ---------------------------------- | ------- | ------ | ---------- | ------------ |
| Uncategorized                      | 15      | -      | 45h 40m    | 45h 50m      |
| 6 Change a booking (MH-06)         | 5       | 5      | 9h 00m     | 14h 16m      |
| 7 Reserve for an hiker (MH-07)     | 6       | 8      | 15h 30m    | 14h 53m      |
| 8 Cancel a booking (MH-08)         | 6       | 3      | 11h 00m    | 9h 32m       |
| 9 Repeat a weekly schedule (MH-09) | 6       | 3      | 10h 00m    | 9h 51m       |
| 10 Define menus (MH-10)            | 1       | 5      | 5h 30m     | 2h 37m       |
| **Total**                          | 39      | 24     | 97h 10m    | 96h 59m      |

> Note: In this table we have considered only the tasks that follow DoD. 

- Hours per task per person (average, standard deviation)

|            | Mean   | StDev  |
| ---------- | ------ | ------ |
| Estimation | 1h 27m | 1h 52m |
| Actual     | 1h 27m | 1h 54m |

> Note: The mean and standard deviation are computed over a total of 67 tasks/subtasks, counting each task without subtasks individually and, for tasks with subtasks, counting only their subtasks.
  
- Total task estimation error ratio: sum of total hours spent / sum of total hours estimation - 1

$$0.00$$

- Absolute relative task estimation error:

$$0.30$$
  
## QUALITY MEASURES

- Unit Testing:
  - Total hours estimated: 12h 45m
  - Total hours spent: 12h 05m
  - Nr of automated unit test cases: 1270
  - Coverage: 80.92%

- Integration testing:
  - Total hours estimated: 4h 48m
  - Total hours spent: 4h 40m
  - Nr of automated unit test cases: 419
  - Coverage: 87.12%

- E2E testing:
  - Total hours estimated: 5h 58m
  - Total hours spent: 6h 47m

- Total test coverage: 89.44 %

- Code review: 
  - Total hours estimated: 10h 58m
  - Total hours spent: 12h 28m

## ASSESSMENT

- What caused your errors in estimation (if any)?
  
  - We understimate the time needed for tasks as "Automatic docker image generation" and "Automate retrospective data report", in witch was required more in-depth research. The research time is difficult to estimate because depends on many factors.

  - During the sprint it was necessary to add new features to meet new requests in user stories or to repurpose the code when unexpected problems appeared, of delivery it was necessary to spend more time on the tasks than estimated.

  - We are different people with different rhythms and so it is difficult to find a balance or a right average for all tasks.

- What lessons did you learn (both positive and negative) in this sprint?

  - Be more aware that requirements can change and therefore estimations can then differ as much from the time actually spent.

  - Adding time to do tasks as we had proposed in the last sprint reduced stress and improved the quality of work.
  
- Which improvement goals set in the previous retrospective were you able to achieve? 

  - We added more time than we had in the last sprint, we didn't actually add 30 minutes to all the tasks, but only to those where I felt it was necessary.
  
  - New GitFlow removing the `QA` branch and develop both features and test inside `dev`.

- Which ones you were not able to achieve? Why?

  - We didn't set deadlines for individual tasks, but it wasn't necessary either, because we organized ourselves day by day through messages to stay aligned with the work to be done.

- Improvement goals for the next sprint and how to achieve them (technical tasks, team coordination, etc.)

  - Using SonarQube Cloud to perform static analysis for code quality.
  
  - Evaluate what to focus on to reduce technical debt and solve problems that affect it.

- One thing you are proud of as a Team!!

  - Flexibility of the team and quick communications on the group chat.

  - Less stress and better quality at work.

  - Better GitFlow, especially at organizazional level, that allows us to change and add features more easily.
