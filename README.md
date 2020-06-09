# Zotodo

Add Todoist tasks for papers in Zotero. Install by downloading the [latest version](https://github.com/wbthomason/zotodo/releases/latest).
Scaffolded with the wonderful
[`generator-zotero-plugin`](https://github.com/retorquere/generator-zotero-plugin).

## Features
- Automatically generate Todoist tasks when new papers are imported
- Generate Todoist tasks for existing papers
- Templating of task and optional task comment, including paper information (authors, title,
  abstract, etc.)
- Customizable project and due date settings
- Customizable labels for tasks

## Installation
1. Download the [latest version](https://github.com/wbthomason/zotodo/releases/latest) of the `.xpi`.
2. In Zotero, go to Tools > Add-ons.
3. Click the  gear icon in the upper right corner, and select "Install Add-On From File".
4. Navigate to where you downloaded the Zotodo `.xpi` and select it.

## Configuration
- See "Zotodo Preferences" in the "Tools" menu.

## Notes
- You **must** set your Todoist API key in the preferences for this plugin to work. OAuth might be
  implemented eventually, but it's not there right now.

## TODO/Future features
- [x] Create project/labels if nonexistent
- [ ] OAuth flow for getting authorization key
- [ ] Set project by Zotero collection
- [ ] Add more template tokens
