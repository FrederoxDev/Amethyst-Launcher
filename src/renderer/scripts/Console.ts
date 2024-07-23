export namespace Console {
  export function Group(callback: () => void, label: string[] = [], collapsed: boolean = false) {
    collapsed ? console.groupCollapsed(...label) : console.group(...label);
    callback()
    console.groupEnd()
  }

  export function StartGroup(label: string | string[] = [], collapsed: boolean = false) {
    collapsed ? console.groupCollapsed(...label) : console.group(...label);
  }

  export function EndGroup() {
    console.groupEnd()
  }

  export function ActionStr(label: string[], formatting: string[] = []) {
    const action_label: string = '%c action %c'
    const action_formatting: string[] = ['background-color: LightSlateGrey; color: White; font-weight: bold','']

    return [[action_label, ...label].join(' '), ...[...action_formatting, ...formatting]]
  }

  export function InfoStr(label: string[], formatting: string[] = []) {
    const action_label: string = '%c info %c'
    const action_formatting: string[] = ['background-color: LightBlue; color: Black; font-weight: bold', '']

    return [[action_label, ...label].join(' '), ...[...action_formatting, ...formatting]]
  }

  export function ReturnStr(label: string[], formatting: string[] = [], failed: boolean = false) {
    const action_label: string = '%c return %c'
    const action_formatting: string[] = [`${failed ? `background-color: LightCoral` : `background-color: LightGreen`}; color: Black; font-weight: bold`, '']

    return [[action_label, ...label].join(' '), ...[...action_formatting, ...formatting]]
  }

  export function ErrorStr(label: string[], formatting: string[] = []) {
    const action_label: string = '%c error %c'
    const action_formatting: string[] = ['background-color: IndianRed; color: White; font-weight: bold', '']

    return [[action_label, ...label].join(' '), ...[...action_formatting, ...formatting]]
  }

  export function Action(label: string[], formatting: string[] = []) {
    console.log(...ActionStr(label, formatting))
  }

  export function Info(label: string[], formatting: string[] = []) {
    console.log(...InfoStr(label, formatting))
  }

  export function Return(label: string[], formatting: string[] = [], failed: boolean = false) {
    console.log(...ReturnStr(label, formatting, failed))
  }

  export function Error(label: string[], formatting: string[] = []) {
    console.log(...ErrorStr(label, formatting))
  }
}