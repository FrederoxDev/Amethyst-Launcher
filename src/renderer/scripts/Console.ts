export namespace Console {
  export function Group(label: string | string[] = '', callback: () => void, collapsed: boolean = true) {
    collapsed ? console.groupCollapsed(...label) : console.group(...label)
    callback()
    console.groupEnd()
  }

  export function StartGroup(label: string | string[] = '', collapsed: boolean = true) {
    collapsed ? console.groupCollapsed(...label) : console.group(...label)
  }

  export function EndGroup() {
    console.groupEnd()
  }

  export function ActionStr(label: string, time: boolean = true) {
    const action_label: string = '%c action %c'
    const action_formatting: string[] = [
      'background-color: LightSlateGrey; color: White; font-weight: bold; border-radius: 3px;',
      ''
    ]

    const time_label = `%c${new Date().toLocaleTimeString()}%c`
    const time_formatting: string[] = ['color: LightSlateGrey;', '']

    return time
      ? [[action_label, label, time_label].join(' '), ...action_formatting, ...time_formatting]
      : [[action_label, label].join(' '), ...action_formatting]
  }

  export function InfoStr(label: string) {
    const info_label: string = '%c info %c'
    const info_formatting: string[] = [
      'background-color: LightBlue; color: Black; font-weight: bold; border-radius: 3px; font-style: italic;',
      ''
    ]

    return [[info_label, label].join(' '), ...info_formatting]
  }

  export function ResultStr(label: string, failed: boolean = false) {
    const result_label: string = '%c result %c'
    const result_formatting: string[] = [
      `${failed ? `background-color: LightCoral` : `background-color: LightGreen`}; color: Black; font-weight: bold; border-radius: 3px;`,
      ''
    ]

    return [[result_label, label].join(' '), ...result_formatting]
  }

  export function ErrorStr(label: string) {
    const error_label: string = '%c error %c'
    const error_formatting: string[] = [
      'background-color: IndianRed; color: White; font-weight: bold; border-radius: 3px;',
      ''
    ]

    return [[error_label, label].join(' '), ...error_formatting]
  }

  export function WarnStr(label: string) {
    const warn_label: string = '%c warn %c'
    const warn_formatting: string[] = [
      'background-color: GoldenRod; color: White; font-weight: bold; border-radius: 3px;',
      ''
    ]

    return [[warn_label, label].join(' '), ...warn_formatting]
  }

  export function Action(label: string, time: boolean = true) {
    console.log(...ActionStr(label, time))
  }

  export function Info(label: string) {
    console.log(...InfoStr(label))
  }

  export function Result(label: string, failed: boolean = false) {
    console.log(...ResultStr(label, failed))
  }

  export function Error(label: string) {
    console.log(...ErrorStr(label))
  }

  export function Warn(label: string) {
    console.log(...WarnStr(label))
  }
}
