declare const Zotero: any
declare const window: any

const marker = 'ZotodoMonkeyPatched'

function patch(object, method, patcher) {
  if (object[method][marker]) return
  object[method] = patcher(object[method])
  object[method][marker] = true
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

function show(
  icon: string,
  headline: string,
  body: string,
  win?: object,
  done: boolean = false,
  duration: number = 3000
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

  return progressWindow
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

  constructor(token: string) {
    this.token = token
  }

  public async createTask(task_data: TaskData) {
    const icon = `chrome://zotero/skin/spinner-16px${
      Zotero.hiDPI ? '@2x' : ''
    }.png`
    const progWin = show(icon, 'Creating task', 'Making Todoist task for item')
    if (this.token == null || this.token === '') {
      this.token = getPref('todoist_token')
    }

    if (this.projects == null) {
      this.projects = await this.getProjects(progWin)
      if (this.projects == null) {
        showError('Failed to get projects!', progWin)
        return
      }
    }

    if (!(task_data.project_name in this.projects)) {
      const project_result = await this.createProject(
        task_data.project_name,
        progWin
      )
      if (!project_result) {
        return
      }
    }

    const project_id = this.projects[task_data.project_name]

    const label_ids = []
    for (const label_name of task_data.label_names) {
      if (this.labels == null) {
        this.labels = await this.getLabels(progWin)

        if (this.labels == null) {
          showError('Failed to get labels!', progWin)
          return
        }
      }

      if (!(label_name in this.labels)) {
        const label_result = await this.createLabel(label_name, progWin)
        if (!label_result) {
          return
        }
      }

      label_ids.push(this.labels[label_name])
    }

    const createPayload: { [k: string]: any } = {
      content: task_data.contents,
      project_id,
      label_ids,
      priority: task_data.priority,
    }

    if (task_data.due_string != null) {
      createPayload.due_string = task_data.due_string
    }

    const createHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    const createResponse = await fetch(
      'https://api.todoist.com/rest/v1/tasks',
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
        'https://api.todoist.com/rest/v1/comments',
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

  private async createProject(
    project_name: string,
    progWin: object
  ): Promise<boolean> {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    }

    const payload = { name: project_name }
    const response = await fetch('https://api.todoist.com/rest/v1/projects', {
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
    const response = await fetch('https://api.todoist.com/rest/v1/labels', {
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

  private async getProjects(progWin: object): Promise<Record<string, number>> {
    return this.getAll('https://api.todoist.com/rest/v1/projects', progWin)
  }

  private async getLabels(progWin: object): Promise<Record<string, number>> {
    return this.getAll('https://api.todoist.com/rest/v1/labels', progWin)
  }
}

const Zotodo = // tslint:disable-line:variable-name
  Zotero.Zotodo ||
  new (class {
    private initialized: boolean = false
    private todoist: TodoistAPI

    private notifierCallback: object = {
      notify(event: string, type: string, ids: number[], _: object) {
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
            Zotodo.makeTaskForItem(item)
          }
        }
      },
    }

    constructor() {
      window.addEventListener(
        'load',_ => {
          this.init().catch(err => Zotero.logError(err))
        },
        false
      )
    }

    public async openPreferenceWindow(paneID: any, action: any) {
      const io = { pane: paneID, action }
      window.openDialog(
        'chrome://zotodo/content/options.xul',
        'zotodo-options',
        'chrome,titlebar,toolbar,centerscreen' +
          Zotero.Prefs.get('browser.preferences.instantApply', true)
          ? 'dialog=no'
          : 'modal',
        io
      )
    }

    public async makeTaskForSelectedItems() {
      const items = Zotero.getActiveZoteroPane()
        .getSelectedItems()
        .filter(
          (item: ZoteroItem) =>
            Zotero.ItemTypes.getName(item.itemTypeID) !== 'attachment' &&
            Zotero.ItemTypes.getName(item.itemTypeID) !== 'note'
        )

      for (const item of items) {
        this.makeTaskForItem(item)
      }
    }

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
        'unload',_ => {
          Zotero.Notifier.unregisterObserver(notifierID)
        },
        false
      )

      this.initialized = true
    }

    private async makeTaskForItem(item: ZoteroItem) {
      // Get the current preference values
      const due_string: string = getPref('due_string')
      const label_names: string[] = (getPref('labels') as string).split(',')
      const ignore_collections: string[] = (getPref(
        'ignore_collections'
      ) as string).split(',')
      // Priority is the reverse of what you'd expect from the p1, p2, etc. pattern
      const priority: number = 5 - getPref('priority') // tslint:disable-line:no-magic-numbers
      const project_name: string = getPref('project')
      const set_due: boolean = getPref('set_due')
      const include_note: boolean = getPref('include_note')
      let note_format: string = getPref('note_format')
      let task_format: string = getPref('task_format')

      // Is the item in an ignored collection?
      const item_collections = item
        .getCollections()
        .map(id => Zotero.Collections.get(id).name)
      for (const ignored_name of ignore_collections) {
        if (item_collections.includes(ignored_name)) {
          return
        }
      }

      const title: string = item.getField('title', false, true)
      const abstract: string = item.getField('abstractNote', false, true)
      const url: string = item.getField('url', false, true)
      const doi: string = item.getField('DOI', false, true)
      let attachment_path = ''
      const attachments: number[] = item.getAttachments()
      if (attachments.length > 0) {
        attachment_path = Zotero.Items.get(attachments[0]).getField(
          'attachmentPath',
          false,
          true
        )
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

      let et_al: string = ''
      if (author_names.length > 0) {
        et_al = author_names[0] + ' et al.'
      }

      const authors = author_names.join(',')
      const item_id = item.id
      const tokens = {
        title,
        abstract,
        url,
        doi,
        attachment_path,
        et_al,
        authors,
        item_id,
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
        } else {
          note_format = note_format.replace(neg_pat, '$1')
          task_format = task_format.replace(neg_pat, '$1')
          note_format = note_format.replace(pos_pat, '')
          task_format = task_format.replace(pos_pat, '')
        }
      }

      // tslint:disable:no-eval prefer-template
      const note_contents: string = eval('`' + note_format + '`')
      const task_contents: string = eval('`' + task_format + '`')
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

      this.todoist.createTask(task_data)
    }
  })()

export = Zotodo

// otherwise this entry point won't be reloaded: https://github.com/webpack/webpack/issues/156
delete require.cache[module.id]
