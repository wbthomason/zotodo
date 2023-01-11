interface ZoteroBooleanPreference {
  value: boolean
}

class Options { // tslint:disable-line:variable-name
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
    ) as unknown as ZoteroBooleanPreference).value
    if (revert) {
      setting_val = !setting_val
    }

    (document.getElementById(
      `id-zotodo-${to_disable}`
    ) as HTMLInputElement).disabled = !setting_val
  }
}

if (!Zotero.Zotodo.Options) Zotero.Zotodo.Options = new Options
