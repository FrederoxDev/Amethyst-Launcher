import * as child from 'child_process'

export class PlatformUtils {
    static async RunCommand(command: string): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const exec_proc = child.exec(command)
            exec_proc.on('exit', exit_code => {
                if (exit_code === 0) {
                    resolve()
                } else {
                    reject(new Error(`Command failed with exit code ${exit_code}`))
                }
            })
        })
    }
}