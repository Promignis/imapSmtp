export function isNotEmpty(ajv: any): any {
    ajv.addKeyword('isNotEmpty', {
        type: 'string',
        validate: function (schema: any, data: any) {
            return typeof data === 'string' && data.trim() !== ''
        },
        errors: false
    })

    return ajv
}