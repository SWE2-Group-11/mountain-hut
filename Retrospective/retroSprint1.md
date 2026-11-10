RETROSPECTIVE SPRINT 1 (Team 11)
=====================================

- [process measures](#process-measures)
- [quality measures](#quality-measures)
- [general assessment](#assessment)

## PROCESS MEASURES 

### Macro statistics

- Number of stories committed vs done : 6 vs 5
  - Done: Book a table (MH-01), Define slot capacity (MH-02), Receive booking confirmation email,
    Check availability (MH-04), Provide party requirements (MH-05)
  - Not done: Change booking (MH-06)
- Total points committed vs done : 29 committed / 24 done
- Nr of hours planned vs spent (as a team) : 94h 50m planned / 98h 4m spent

### Definitions of Done

- Unit tested
- Integration tested
- E2E tested
- Code reviewed (at least one teammate approval on the PR)
- Code pushed on GitHub and merged through `dev` -> `QA` -> `main` with CI passing (lint, type-check, Vitest, Playwright)

### Detailed statistics

| Story                                | # Tasks | Points | Hours est. | Hours actual |
| ------------------------------------ | ------- | ------ | ---------- | ------------ |
| Uncategorized                        | 17      | -      | 46h 20m    | 43h 16m      |
| 1 Book a table (MH-01)               | 8       | 8      | 11h 00m    | 17h 18m      |
| 2 Define slot capacity (MH-02)       | 7       | 5      | 9h 00m     | 10h 37m      |
| 3 Receive booking confirmation       | 4       | 3      | 3h 00m     | 5h 18m       |
| 4 Check availability (MH-04)         | 7       | 3      | 8h 00m     | 8h 25m       |
| 5 Provide party requirements (MH-05) | 7       | 5      | 8h 00m     | 8h 15m       |
| 6 Change booking (MH-06)             | 7       | 5      | 9h 30m     | 4h 55m       |
| **Total**                            | 57      | 29     | 94h 50m    | 98h 4m       |


- Hours per task per person (average, standard deviation)

|            | Mean   | StDev  |
| ---------- | ------ | ------ |
| Estimation | 1h 40m | 2h 15m |
| Actual     | 1h 51m | 2h 7m  |
  
- Total task estimation error ratio: sum of total hours estimation / sum of total hours spent -1

$$0.03$$

- Absolute relative task estimation error:

$$0.42$$
  
## QUALITY MEASURES

- Unit Testing:
  - Total hours estimated: 8h
  - Total hours spent: 11h 23m
  - Nr of automated unit test cases: 595
  - Coverage: 87.2%

- Integration testing:
  - Total hours estimated: 5h 30m
  - Total hours spent: 4h 34m
  - Nr of automated unit test cases: 204
  - Coverage: 90.26%

- E2E testing:
  - Total hours estimated: 5h 30m
  - Total hours spent: 4h 34m

- Total test coverage: 96.63 %

- Code review: 
  - Total hours estimated: 10h 30m
  - Total hours spent: 9h 4m



## ASSESSMENT

- What caused your errors in estimation (if any)?
  
  Too little experience caused us to mostly underestimate tasks, without considering issues, and consequences on connected components.

- What lessons did you learn (both positive and negative) in this sprint?

  It would be better to add an extra 30 minutes to every task estimation, seeing how much we accomplished versus what we estimated.
  We should look into setting a deadline for individual tasks.

- Which improvement goals set in the previous retrospective were you able to achieve? 

  All of them:
  - Define scope and needed implementation, BEFORE assigning story points to tasks
  - Planning meeting need to clearly assign tasks to people, by also taking into account each team member’s commitments and availability
  - Configure the execution environment using Docker and Docker Compose, to avoid platform-specific issues
  - Prepare the final demo in advance by defining a shared outline or script
  
- Which ones you were not able to achieve? Why?

  None

- Improvement goals for the next sprint and how to achieve them (technical tasks, team coordination, etc.)

  Gitflow we choose is a burden, we are looking into removing the `QA` branch and develop both features and test inside `dev`

- One thing you are proud of as a Team!!

  Flexibility of the team and quick communications on the group chat.
