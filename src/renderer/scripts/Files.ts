// This is really janky and probably shouldn't be used
export function ValidateJSON<T extends object>(in_json: Record<string, unknown>, validated_object: T, outErrors?: string[]) {
    const object_data_array: {object: object, json: Record<string, unknown>, parent_key?: string}[] = [{object: validated_object, json: in_json}];

    while (object_data_array.length > 0) {
        const object_data = object_data_array.pop();

        if (object_data) {
            const object = object_data.object;
            const parent_key = object_data.parent_key;
            const json = object_data.json;
            for (const key  of Object.keys(object)) {
                if (typeof object[key as never] !== 'undefined') {
                    if (json[key]) {
                        if (typeof json[key] !== typeof object[key as never]) {
                            if (parent_key) {
                                outErrors?.push(`field '${key}' in '${parent_key}' must be of type '${typeof object[key as never]}'`);
                            } else {
                                outErrors?.push(`field '${key}' must be of type '${typeof object[key as never]}'`);
                            }
                        }

                        if (typeof object[key as never] === 'object') {
                            object_data_array.push({
                                object: object[key as never],
                                json: json[key] as Record<string, unknown>,
                                parent_key: key
                            });
                        }
                    }
                    else {
                        if (parent_key) {
                            outErrors?.push(`'${parent_key}' must contain field '${key}' of type '${typeof object[key as never]}'`);
                        }
                        else {
                            outErrors?.push(`JSON must contain field '${key}' of type '${typeof object[key as never]}'`);
                        }
                    }
                }
            }
        }
    }
}