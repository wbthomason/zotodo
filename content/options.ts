declare const Zotero: any
declare const document: any

interface ZoteroBooleanPreference {
  value: boolean
}

const Options = new (class { // tslint:disable-line:variable-name
  public updatePreferenceWindow(which: string) {
    switch (which) {
      case 'init-all':
        this.disablePref('include-note', 'note-format', false)
        this.disablePref('set-due', 'due-string', false)
        break
      case 'include-note':
        this.disablePref('include-note', 'note-format', true)
        break
      case 'set-due':
        this.disablePref('set-due', 'due-string', true)
        break
      default:
        Zotero.logError(`Unexpected preference value: ${which}`)
    }
  }

  private disablePref(setting_name: string, to_disable: string, revert: boolean) {
    let setting_val: boolean = (document.getElementById(
      `pref-zotodo-${setting_name}`
    ) as ZoteroBooleanPreference).value
    if(revert) {
      setting_val = !setting_val
    }

    (document.getElementById(
      `id-zotodo-${to_disable}`
    ) as HTMLInputElement).disabled = !setting_val
  }
})()

export = Options

// otherwise this entry point won't be reloaded: https://github.com/webpack/webpack/issues/156
delete require.cache[module.id]
