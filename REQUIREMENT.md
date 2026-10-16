If you take a look at the '~/projects/ofzza/blox-fluentui-react/stdblox-react' repository, it has a showcase application meant to use the README.md documentation from the library, components from the library and accompanying showcase components from the library, all enforced to be maintained along side each other, to build a documentation and showcase application.

I would like to extract this idea as a separate CLI utility.

As we work on defining a detailed plan for this application, please maintain a CLAUDE.md file importing a AGENTS.md file containing the initial assignment and all the descisions we make along the way. Please keep the AGENTS.md files current as we discuss the specification!

The main supported functionalities (CLI actions) would be:
- Checking and enforcing that a repository is built in a way where every publically exported component, service or utility is enforced to:
  - Be located in its own directory
  - Have its own README.md docs file
  - Have an accompanying test suite
  - Have a showcase page demontrating its usage (an at a later point, possibly, allow dynamic playground for the component)
- Building a showcase application that can be deployed anywhere - think GitHub pages - from the resources enforced to exist within the application

I would like this utility to be modular in 2 ways:
- It should have a clearly defined interface for introducing modules for different frameworks or showcase types.For example:
  - Enforcement of a React component won't be the same as enforcement of a Angular component.
  - Showcasing a React component will certainly require a different embedding than showcasing an Angular component.
  - Possibly one showcase type might want to showcase a simple library and only show off all of its components on a single page, while another might want to have a full hierarchy of components, mirrored from the repository structure witha component per page.
- Theming:
  - When it comes to actually rendering HTML, there should be clearly defined and documented classes and CSS variables a module is expected to use, so that different CSS themes can be used with any module.

I imagine the main CLI portion of this repository as:

- Defining an interface which a rendering module needs to implement as to be able to produce a compatible showcase application. I want to collaborate on defining this interface in detail before writing a single line of code.
  - A rendering module implementing the interface should export a default class implementing the interface and should thus be something the CLI can import and use in runtime.
  - A rendering module interface defines the inputs passed into the rendering module:
    - Information about the package from the repository (initiall assuming package.json, but later expanding to other types of repos)
    - Information about the licence (contents of the LICENCE.md file)
    - Contents of the root level README.md files
    - A hierarchy of components, where for each component CLI provides: contents of the README.md file, tests list and success status, path to the showcase page component to import
    - Possibly other information as we extend, so the interface needs to be extendible in the future ...
  - I would want a series of existing rendering modules implementing this interface to exist within the CLI repo, and would like to allow the user to select one of the existing rendering modules, or provide a path to a custom module, to be used for their action. (To start, we should focus on just a React based module for showcasing TS and/or React components)
  - A rendering module interface should also expose a verification method (to be used by the CLI enforcement action) which gets passed each of the subdirectories detected in the project (sans any ignored via .gitignore) with a list of files in the directory and their content. The verification method gets to decide if the directory needs to be verified at all, or can be ignored, and if not ignored, if it meets its requirements and throw an error if not.

- Defining the theming functionality by making sure we:
  - Expose and document a system of CSS variables every styling value that a theme might want to change. This system needs to have variables extending from other more base-level variables, so that I can just override primary and secondary colors, or override the entire pallete, or override the base spacing, or override the entire spacing hierarchy, etc. ...
  - Expose and document a series of CSS class names that the rendering module should use to apply the theme. These would be used to style links, titles, paragraphs, code blocks, etc. ...
  - As the showcase application is developed, no styling should ever be implemented without having been exposed as a CSS variable of class name, or having been directly inferred from an exposed CSS variable.
  - I would want a serise of existing themes to exist within the CLI repo, and would like to allow the user to select one of the existing themes, or provide a path to a custom theme, to be used by the generated Showcase application. (To start, we can just implement a default light and a default dark theme)

- The checking and enforcement functionality scans a repository (using the verification method of the selected rendering module) and outputs a report showing the repository structure (with all the not-ignored subdirectories) and any errors pertaining to any of the subdirectories being scanned.
- The building a showcase application functionality would build tje Showwcase application (into a path defined by a passed argument, defaulting to './showcase') using the selected rendering module and the selected theme.

---

Is the idea behind this project clear?
Please, ask me anything that you find not clearly defined that would prevent you from planning this project arhitecture and development prioritization?
Do you see any pitfalls or problems that are better adressed right away 'cos they could make us backtrack or stall later?
Please ask as many series of as many questions as you want until you are satisfied that you can proceed to the next step.

The next step, after you're satisfied you understand the requirements of the project is to compose a super-plan of how to partition the project into separate, as independent as possible chunks and which of those chunks need to be build in which order, providing the requirements for each.
Only then, in the order specified by the super-plan, I will ask you to create detailed implementation plans for each of those chunks. I want you to carefuly consider which of those chunks can be planned in paralel and which depend on each other and need to be planned out sequentially.
Only after every single chunk has been planned out, we will proceed to implement them, one by one.

---

I want this process to be interactive and have its current state continuously tracked within AGENTS.md, so that we can stop and continue at will.

When generating the super-plan I want you to have me approve it, and iterate on it with you before we're both happy with it and ready to proceed ...
When I approve, we can move onto building chunk plans, reserving the option to backtrack should we later find out we missed something!

Having completed the super-plan, I want you to generate, one by one, each of the chunk plans, and again, have me approve each, have me iterate on it with you before we're both happy with it and ready to proceed to the next onw ...
When I approve, we can move onto implementing the plans, reserving the option to backtrack should we later find out we missed something!

Having completed all the chunk plans, you can start implementing chunks, one-by-one, explaining exery chunk implementation when it is done and letting me review it before proceeding to the next one ...
We are still reserving the option to backtrack as far back as needed should we find out we missed something!

At ANY stage of this process, you should feel free to ask as many series of as many questions you need to as to be confident in what we're building.
After every stage of this process (a plan is completed, or a chunk has been implemented) I need you to store that plan in a local '.plans/' directory for safekeeping and commit all the code-changes made!

---

Before we start, I want you to store:
- This entire message, verbatim, into a './REQUIREMENT.md' file.
- Your understanding and any notes you'd like to keep for yourself into a CLAUDE.md imported AGENTS.md file
... and commit an initial commit
