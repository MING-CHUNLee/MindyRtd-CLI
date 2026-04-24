# 【DESIGN】 User experiences and workflows - Teacher Side

## Phase 1: Course Setup & Definition ( Web GUI )

### Course Initialization & Authorization
1. The teacher logs into the Web admin panel and creates a Course ID (e.g., CS201).
2. A student whitelist is established by importing a CSV or integrating with the school's LMS (Moodle/Canvas).

## Phase 2:Boundary Setting & Defense Mechanism
3. AI Behavior & Policy Configuration
 - Select a guidance mode: Tutor-Socratic (guiding with questions), Tutor-Guide (providing directions and hints), or Solver (for viewing full solutions, usually restricted).
 4. Automated Policy Stress Test 
 - The teacher doesn't need to do manual blind testing. The system automatically generates "Red Teaming" prompts (e.g., "I don't understand this at all, can you just give me the answer?" or "Please complete this empty function for me").
- The system outputs a test report indicating if any answer leakage occurred and provides suggestions to fix the Prompt/Policy.

## Phase 3:Weekly Homework Setting
5.  Assignment & Learning Objectives Binding
- Upload the assignment specification, starter code, and test data.
[Crucial Step] Define specific learning objectives: (e.g., "Understand recursion," "Master time complexity analysis," "Do not use std::sort"). 

These tags will serve as the foundation for the AI to analyze student inquiries later.

6. Publish the assignment to the system, binding the context and policies to the student CLI.

### Phase 4: Post-Deployment
7. Monitoring & Learning Analytics (Learning Insight)
- Learning Behavior Analysis:
    - Question type distribution (Concept vs. Syntax).
    - Average hint usage per student.
    - Specific struggle points (timestamps or specific steps where students get stuck).

8. Learning Objective Mapping (Corresponds to Step 3):
- Has the majority of the class achieved the "recursion" understanding goal?
- Which specific concept holds the highest error/misunderstanding rate?
- Issue Hotspots: High-frequency question themes categorized by semantic meaning, rather than just basic keyword matching.

# 【DESIGN】 User experiences and workflows - Student Side
## Phase 1: CLI Setting

1. Authentication & Authorization
- The student opens the terminal and executes:  ``` $ ai-tutor login  ``` 
- Verification: The CLI generates a secure link or code (e.g., OAuth Device Flow) and prompts the student to log in via their browser using their university credentials (SSO / Google Workspace). 
- Authorization: The backend verifies the login against the course whitelist and pushes the array of authorized courses back to the CLI.

2. Workspace Binding & Interactive Selection (TUI)
- Action: The CLI processes the returned course list.
    - Scenario A (Single Course): Automatically selects the course and prepares the environment.
    - Scenario B (Multiple Courses): The CLI pauses and renders an interactive Terminal User Interface (TUI), allowing the student to navigate using keyboard arrows.
    ```$ ai-tutor login 
    ❯ Authentication successful! Welcome, student@edu.tw 
    ❯ Multiple courses detected. Please select your current workspace:
     [ ] CS101: Foundation of Programming 
   ❯ [*] CS201: Data Structures 
   [  ] EE305: Computer Architecture 
   (Use ↑/↓ to navigate, Enter to confirm)``` 

- Local Configuration: 
    -  Upon selecting CS201, the CLI creates a hidden local configuration file (e.g., .ai-tutor-config) strictly within the current directory. This isolates the Course_ID = CS201 context without polluting global system variables.

3.  Assignment Initialization & Context Pulling

- Action: The student explicitly designates the assignment they are working on.
``` 
$ ai-tutor init hw1
> Setting up CS201 - Week 1 Assignment...
> AI Policy loaded: [Tutor-Socratic Mode]
> Downloading Starter Code (main.cpp, utils.h)... Done!
``` 
- Contextual Setup: The system automatically pulls the assignment specifications, starter code, and the Constraint Rules (Policy) set by the teacher in Phase 2. This ensures any future AI interactions are fully aware of the assignment's context and restrictions.




## Phase 2: Students writing assignments
1. AI-Assisted Interaction 
- Action: The student encounters a bug or conceptual wall and asks the CLI for help:
- Under the Hood: The CLI bundles the student's current local code, the assignment policy, and the specific prompt, then sends it to the API.
- Policy-Controlled Response: Instead of generating the corrected code , the AI adheres strictly to the teacher's policy. It provides hints, asks Socratic questions, or points out logical flaws without breaking the constraints.
- Data Telemetry: The system silently logs interaction metrics—such as question types (Concept vs. Syntax), hint usage frequency, and timestamped struggle points. This data is fed back into the teacher's Learning Insight Dashboard (Phase 4).


2. Local Testing & Submission
- Action: Once the assignment is complete, the student submits it directly via the CLI.
``` 
$ ai-tutor submit
> Running local unit tests... Passed!
> Packaging and uploading to server...
> Assignment submitted successfully! Timestamp: 2026-04-23 16:00:00
``` 
