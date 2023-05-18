declare const Zotero: any
// declare const window: any

const monkey_patch_marker = 'ZotodoMonkeyPatched'

// eslint-disable-next-line @typescript-eslint/no-unused-vars, no-inner-declarations, prefer-arrow/prefer-arrow-functions
function patch(object, method, patcher) {
  if (object[method][monkey_patch_marker]) return
  object[method] = patcher(object[method])
  object[method][monkey_patch_marker] = true
}

function getPref(pref_name: string): any {
  return Zotero.Prefs.get(`extensions.zotodo.${pref_name}`, true)
}

function showError(err: string, progWin: object) {
  show(
    'chrome://zotero/skin/cross.png',
    'Failed to make task for item!',
    err,
    progWin,
    true
  )
}

function showSuccess(task_data: TaskData, progWin: object) {
  show(
    'chrome://zotero/skin/tick.png',
    'Made task for item!',
    `Created task "${task_data.contents} in project ${task_data.project_name}`,
    progWin,
    true
  )
}

const NOTIFICATION_DURATION = 3000

function show(
  icon: string,
  headline: string,
  body: string,
  win?: object,
  done = false,
  duration = NOTIFICATION_DURATION
) {
  const progressWindow =
    win || new Zotero.ProgressWindow({ closeOnClick: true })
  progressWindow.changeHeadline(`Zotodo: ${headline}`, icon)
  progressWindow.addLines([body], [icon])
  if (win == null) {
    progressWindow.show()
  }

  if (done) {
    progressWindow.startCloseTimer(duration)
  }

  return progressWindow as object
}

interface ZoteroCreator {
  firstName: string
  lastName: string
  fieldMode: number
  creatorTypeID: number
}

interface ZoteroItem {
  key: string
  itemType: string
  libraryID: number
  id: number
  itemTypeID: number
  getField(
    field: string,
    unformatted: boolean,
    includeBaseMapped: boolean
  ): any
  getCollections(): number[]
  getAttachments(): number[]
  getCreators(): ZoteroCreator[]
}

class TaskData {
  public contents: string
  public note: string = null
  public due_string: string = null
  public project_name: string
  public section_name: string = null
  public priority: number
  public label_names: string[]
  constructor(
    contents: string,
    priority: number,
    project_name: string,
    label_names: string[]
  ) {
    this.contents = contents
    this.priority = priority
    this.project_name = project_name
    this.label_names = label_names
  }
}

class TodoistAPI {
  private token: string = null
  private projects: Record<string, number> = null
  private labels: Record<string, number> = null
  private sections: Record<string, Record<string, number>> = {}

  constructor(token: string) {
    this.token = token
  }

  public async createTask(task_data: TaskData) {
    const icon = `chrome://zotero/skin/spinner-16px${Zotero.hiDPI ? '@2x' : ''
    }.png`
    const progWin = show(icon, 'Creating task', 'Making Todoist task for item')
    if (this.token == null || this.token === '') {
      this.token = getPref('todoist_token')
    }

    const project_id = await this.getProjectId(task_data.project_name, progWin)
    if (project_id == null) {
      return
    }

    let section_id = null
    if (task_data.section_name != null) {
      section_id = await this.getSectionId(
        task_data.section_name,
        task_data.project_name,
        progWin
      )
      if (section_id == null) {
        return
      }
    }

    const label_ids = []
    for (const label_name of task_data.label_names) {
      const label_id = await this.getLabelId(label_name, progWin)
      if (label_id == null) {
        return
      }

      label_ids.push(label_id)
    }

    const createPayload: { [k: string]: any } = {
      content: task_data.contents,
      project_id,
      priority: task_data.priority,
    }

    if (label_ids.length > 0) {
      createPayload.label_ids = label_ids
    }

    if (section_id != null) {
      createPayload.section_id = section_id
    }

    if (task_data.due_string != null) {
      createPayload.due_string = task_data.due_string
    }

    const createHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    const createResponse = await fetch(
      'https://api.todoist.com/rest/v2/tasks',
      {
        method: 'POST',
        headers: createHeaders,
        body: JSON.stringify(createPayload),
      }
    )

    if (!createResponse.ok) {
      const err = await createResponse.text()
      const msg = `Error creating task: ${createResponse.statusText} ${err}`
      showError(msg, progWin)
      Zotero.logError(msg)
      return
    }

    if (task_data.note != null) {
      const task_id = (await createResponse.json()).id
      const notePayload = {
        content: task_data.note,
        task_id,
      }

      const noteHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      }

      const noteResponse = await fetch(
        'https://api.todoist.com/rest/v2/comments',
        {
          method: 'POST',
          headers: noteHeaders,
          body: JSON.stringify(notePayload),
        }
      )

      if (!noteResponse.ok) {
        const err = await noteResponse.text()
        const msg = `Error adding comment: ${noteResponse.statusText} ${err}`
        showError(msg, progWin)
        Zotero.logError(msg)
        return
      }
    }

    showSuccess(task_data, progWin)
  }

  private async getSectionId(
    section_name: string,
    project_name: string,
    progress_win: object
  ): Promise<number | null> {
    if (this.sections[project_name] === undefined) {
      const project_sections = await this.getSections(
        project_name,
        progress_win
      )
      if (project_sections == null) {
        showError('Failed to get sections!', progress_win)
        return null
      }

      this.sections[project_name] = project_sections
    }

    if (!(section_name in this.sections[project_name])) {
      const section_result = await this.createSection(
        section_name,
        project_name,
        progress_win
      )

      if (!section_result) {
        return null
      }
    }

    return this.sections[project_name][section_name]
  }

  private async getProjectId(
    project_name: string,
    progress_win: object
  ): Promise<number | null> {
    if (this.projects == null) {
      this.projects = await this.getProjects(progress_win)
      if (this.projects == null) {
        showError('Failed to get projects!', progress_win)
        return null
      }
    }

    if (!(project_name in this.projects)) {
      const project_result = await this.createProject(
        project_name,
        progress_win
      )
      if (!project_result) {
        return null
      }
    }

    return this.projects[project_name]
  }

  private async getLabelId(
    label_name: string,
    progress_win: object
  ): Promise<number | null> {
    if (this.labels == null) {
      this.labels = await this.getLabels(progress_win)

      if (this.labels == null) {
        showError('Failed to get labels!', progress_win)
        return null
      }
    }

    if (!(label_name in this.labels)) {
      const label_result = await this.createLabel(label_name, progress_win)
      if (!label_result) {
        return null
      }
    }

    return this.labels[label_name]
  }

  private async createSection(
    section_name: string,
    project_name: string,
    progWin: object
  ): Promise<boolean> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    const project_id = await this.getProjectId(project_name, progWin)
    if (project_id == null) {
      return
    }

    const payload = { name: section_name, project_id }
    const response = await fetch('https://api.todoist.com/rest/v2/sections', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.text()
      const msg = `Error creating section ${section_name} in project ${project_name}: ${response.statusText} ${err}`
      showError(msg, progWin)
      Zotero.logError(msg)
      return false
    }

    const data = await response.json()
    this.sections[project_name][data.name] = data.id

    return true
  }

  private async createProject(
    project_name: string,
    progWin: object
  ): Promise<boolean> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    const payload = { name: project_name }
    const response = await fetch('https://api.todoist.com/rest/v2/projects', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.text()
      const msg = `Error creating project ${project_name}: ${response.statusText} ${err}`
      showError(msg, progWin)
      Zotero.logError(msg)
      return false
    }

    const data = await response.json()
    this.projects[data.name] = data.id

    return true
  }

  private async createLabel(
    label_name: string,
    progWin: object
  ): Promise<boolean> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    const payload = { name: label_name }
    const response = await fetch('https://api.todoist.com/rest/v2/labels', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const err = await response.text()
      const msg = `Error creating label ${label_name}: ${response.statusText} ${err}`
      showError(msg, progWin)
      Zotero.logError(msg)
      return false
    }

    const data = await response.json()
    this.labels[data.name] = data.id

    return true
  }

  private async getAll(
    endpoint: string,
    progWin: object
  ): Promise<Record<string, number>> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    const response = await fetch(endpoint, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      const err = await response.text()
      const msg = `Error requesting from ${endpoint}: ${response.statusText} ${err}`
      showError(msg, progWin)
      Zotero.logError(msg)
      return null
    }

    const data = await response.json()
    const items: { [k: string]: number } = {}
    for (const item of data) {
      items[item.name] = item.id
    }

    return items
  }

  private async getSections(
    project_name: string,
    progWin: object
  ): Promise<Record<string, number>> {
    const project_id = await this.getProjectId(project_name, progWin)
    if (project_id == null) {
      return
    }

    return this.getAll(
      `https://api.todoist.com/rest/v2/sections?project_id=${project_id}`,
      progWin
    )
  }

  private async getProjects(progWin: object): Promise<Record<string, number>> {
    return this.getAll('https://api.todoist.com/rest/v2/projects', progWin)
  }

  private async getLabels(progWin: object): Promise<Record<string, number>> {
    return this.getAll('https://api.todoist.com/rest/v2/labels', progWin)
  }
}

class Zotodo { // tslint:disable-line:variable-name
  private initialized = false
  private todoist: TodoistAPI
  private globals: Record<string, any>

  // eslint-disable-next-line @typescript-eslint/require-await
  public async load(globals: Record<string, any>) {
    this.globals = globals
    if (this.initialized) return
    await this.init()
    this.initialized = true
  }


  private notifierCallback: object = {
    notify: (event: string, type: string, ids: number[], _: object) => {
      if (getPref('automatic_add') && type === 'item' && event === 'add') {
        const items = Zotero.Items.get(ids)
          .map((item: ZoteroItem) => {
            item.itemType = Zotero.ItemTypes.getName(item.itemTypeID)
            return item
          })
          .filter(
            (item: ZoteroItem) =>
              item.itemType !== 'attachment' && item.itemType !== 'note'
          )

        for (const item of items) {
          Zotero.log(`Making task for ${JSON.stringify(item)}`)
          Zotero.Zotodo.makeTaskForItem(item)
        }
      }
    },
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async openPreferenceWindow(paneID: any, action: any) {
    const io = { pane: paneID, action }
    this.globals.window.openDialog(
      'chrome://zotodo/content/options.xul',
      'zotodo-options',
      // eslint-disable-next-line no-constant-condition
      `chrome,titlebar,toolbar,centerscreen${Zotero.Prefs.get('browser.preferences.instantApply', true)}`
        ? 'dialog=no'
        : 'modal',
      io
    )
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  public async makeTaskForSelectedItems() {
    const items = Zotero.getActiveZoteroPane()
      .getSelectedItems()
      .filter(
        (item: ZoteroItem) =>
          Zotero.ItemTypes.getName(item.itemTypeID) !== 'attachment' &&
          Zotero.ItemTypes.getName(item.itemTypeID) !== 'note'
      )

    for (const item of (items as ZoteroItem[])) {
      void this.makeTaskForItem(item)
    }
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async init() {
    if (this.initialized) {
      return
    }

    // Get Todoist information
    const todoist_token: string = getPref('todoist_token')
    this.todoist = new TodoistAPI(todoist_token)

    // Register notifier
    const notifierID = Zotero.Notifier.registerObserver(
      this.notifierCallback,
      ['item']
    )

    // Unregister notifier when window closes to avoid memory leak
    window.addEventListener(
      'unload', _ => {
        Zotero.Notifier.unregisterObserver(notifierID)
      },
      false
    )

    this.initialized = true
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  private async makeTaskForItem(item: ZoteroItem) {
    // Get the current preference values
    const due_string: string = getPref('due_string')
    const label_names_string: string = getPref('labels') as string
    let label_names: string[] = []
    if (label_names_string !== '') {
      label_names = label_names_string.split(',')
    }

    const ignore_collections: string[] = (getPref(
      'ignore_collections'
    ) as string).split(',')
    // Priority is the reverse of what you'd expect from the p1, p2, etc. pattern
    // eslint-disable-next-line @typescript-eslint/no-magic-numbers
    const priority: number = 5 - getPref('priority')
    const project_name: string = getPref('project')
    const section_name: string = getPref('section')

    const set_due: boolean = getPref('set_due')
    const include_note: boolean = getPref('include_note')
    let note_format: string = getPref('note_format')
    let task_format: string = getPref('task_format')

    // Is the item in an ignored collection?
    const item_collections = item
      .getCollections()
      .map(id => Zotero.Collections.get(id).name as string)
    for (const ignored_name of ignore_collections) {
      if (item_collections.includes(ignored_name)) {
        return
      }
    }

    const title: string = item.getField('title', false, true)
    const abstract: string = item.getField('abstractNote', false, true)
    const url: string = item.getField('url', false, true)
    const doi: string = item.getField('DOI', false, true)
    let pdf_path = ''
    let pdf_id = -1
    const attachments: number[] = item.getAttachments()
    if (attachments.length > 0) {
      for (const id of attachments) {
        const attachment = Zotero.Items.get(id)
        if (attachment.attachmentContentType === 'application/pdf') {
          pdf_path = attachment.attachmentPath
          pdf_id = attachment.key
          break
        }
      }
    }

    const author_type_id: number = Zotero.CreatorTypes.getPrimaryIDForType(
      item.itemTypeID
    )

    const author_names: string[] = item
      .getCreators()
      .filter(
        (creator: ZoteroCreator) => creator.creatorTypeID === author_type_id
      )
      .map(
        (creator: ZoteroCreator) => `${creator.firstName} ${creator.lastName}`
      )

    let et_al = ''
    if (author_names.length > 0) {
      et_al = `${author_names[0]} et al.`
    }

    const authors = author_names.join(', ')
    const item_id = item.key
    let library_path = 'library'
    if (Zotero.Libraries.get(item.libraryID).libraryType === 'group') {
      library_path = Zotero.URI.getLibraryPath(item.libraryID)
    }

    const select_uri = `zotero://select/${library_path}/items/${item_id}`
    let open_uri = ''
    if (pdf_id !== -1) { open_uri = `zotero://open-pdf/${library_path}/items/${pdf_id}` }
    let citekey = ''
    if (
      typeof Zotero.BetterBibTeX === 'object' &&
      Zotero.BetterBibTeX !== null
    ) {
      citekey = Zotero.BetterBibTeX.KeyManager.get(
        item.getField('id', false, true)
      ).citekey
    }

    const tokens = {
      title,
      abstract,
      url,
      doi,
      pdf_path,
      pdf_id,
      et_al,
      authors,
      library_path,
      item_id,
      select_uri,
      open_uri,
      citekey,
    }

    for (const token_name of Object.keys(tokens)) {
      const pos_pat = RegExp(`\\?\\$\\{${token_name}\\}:([^?]*)\\?`, 'gm')
      const neg_pat = RegExp(`!\\$\\{${token_name}\\}:([^!]*)!`, 'gm')
      const token_defined =
        tokens[token_name] != null && tokens[token_name] !== ''
      if (token_defined) {
        note_format = note_format.replace(pos_pat, '$1')
        task_format = task_format.replace(pos_pat, '$1')
        note_format = note_format.replace(neg_pat, '')
        task_format = task_format.replace(neg_pat, '')
      }
      else {
        note_format = note_format.replace(neg_pat, '$1')
        task_format = task_format.replace(neg_pat, '$1')
        note_format = note_format.replace(pos_pat, '')
        task_format = task_format.replace(pos_pat, '')
      }
    }

    // eslint-disable-next-line no-eval
    const note_contents: string = eval(`\`${note_format}\``)
    // eslint-disable-next-line no-eval
    const task_contents: string = eval(`\`${task_format}\``)
    // tslint:enable:no-eval prefer-template
    const task_data = new TaskData(
      task_contents,
      priority,
      project_name,
      label_names
    )

    if (include_note) {
      task_data.note = note_contents
    }

    if (set_due) {
      task_data.due_string = due_string
    }

    if (section_name !== '') {
      task_data.section_name = section_name
    }

    void this.todoist.createTask(task_data)
  }
}

if (!Zotero.Zotodo) Zotero.Zotodo = new Zotodo
