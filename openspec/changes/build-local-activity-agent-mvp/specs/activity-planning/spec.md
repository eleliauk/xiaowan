## ADDED Requirements

### Requirement: Parse short outing goals
The system SHALL convert a user's natural-language outing request into a structured goal containing scenario, date, time window, duration, origin, party, preferences, and constraints.

#### Scenario: Family goal is parsed
- **GIVEN** the user says they want to go out this afternoon with wife and child for a few hours near home
- **WHEN** the planning graph parses the message
- **THEN** the structured goal includes the family scenario, afternoon time window, 4-6 hour duration, near-home constraint, wife, and 5-year-old child

#### Scenario: Friends goal is parsed
- **GIVEN** the user says four friends, two men and two women, want to go out this afternoon and eat together
- **WHEN** the planning graph parses the message
- **THEN** the structured goal includes the friends scenario, party size four, gender mix note, afternoon time window, meal requirement, and near-home constraint

### Requirement: Infer scenario constraints
The system SHALL apply scenario-specific constraints before generating a plan.

#### Scenario: Family constraints are applied
- **GIVEN** a family goal with a 5-year-old child and a wife who is losing weight
- **WHEN** the planner generates candidates
- **THEN** candidates prioritize child-friendly activities, lower-fat meal options, short travel, and low queue risk

#### Scenario: Friends constraints are applied
- **GIVEN** a friends goal for two men and two women
- **WHEN** the planner generates candidates
- **THEN** candidates prioritize social activities, restaurant atmosphere, walkability, and group seating availability

### Requirement: Generate complete afternoon timelines
The system SHALL produce an afternoon plan that covers activity, meal, optional add-on activity, travel buffers, and expected total duration.

#### Scenario: Plan contains executable steps
- **GIVEN** a parsed goal and available local candidates
- **WHEN** the planner composes a plan
- **THEN** the plan contains ordered timeline steps with start time, end time, place, duration, notes, and evidence references

#### Scenario: Duration stays within target range
- **GIVEN** the user asks for a few hours in the afternoon
- **WHEN** the planner selects a final plan
- **THEN** the total planned duration is between 4 and 6 hours unless the plan explicitly explains why it is shorter or longer

### Requirement: Rank plans with scenario-specific scoring
The system SHALL score candidate plans using scenario-specific weighting for fit, distance, queue risk, food constraints, budget, and time smoothness.

#### Scenario: Family plan scoring favors low-friction choices
- **GIVEN** one candidate has a child-friendly activity and low queue restaurant while another has a trendy but crowded restaurant
- **WHEN** the family scoring policy ranks candidates
- **THEN** the low-friction child-friendly candidate ranks higher

#### Scenario: Friends plan scoring favors social experience
- **GIVEN** one candidate has a social exhibition and atmospheric restaurant while another has a quiet family restaurant
- **WHEN** the friends scoring policy ranks candidates
- **THEN** the social exhibition and atmospheric restaurant candidate ranks higher

### Requirement: Explain the selected plan
The system SHALL provide a concise user-facing explanation for why the selected plan fits the scenario and constraints.

#### Scenario: Explanation cites real checks
- **GIVEN** the selected plan was built from tool results
- **WHEN** the UI displays the recommendation
- **THEN** the explanation references checked availability, queue time, distance, and scenario fit without inventing unavailable data
