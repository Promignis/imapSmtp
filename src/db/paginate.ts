import mongoose from 'mongoose'
// TODO: Look into why the official mongodb bson module fails at stringifying date type bson objects
// For now using mongodb-extended-json package for stringifying
// import { EJSON } from 'bson'
var EJSON = require('mongodb-extended-json');
import objPath from 'object-path'

export default async function paginate(collection: mongoose.Collection, params: any): Promise<any> {
    // const removePaginatedFieldInResponse = params.fields && !params.fields[params.paginatedField];
    params = sanatizeParams(params)
    const cursorQuery = generateCursorQuery(params);
    const $sort = generateSort(params);

    const findOptions: any = {
        projection: params.fields
    }

    const query = collection.find({ $and: [cursorQuery, params.query] }, findOptions)

    const results = await query
        .sort($sort)
        .limit(params.limit + 1) // Query one more element to see if there's another page.
        .toArray();

    const response = prepareResponse(results, params);

    return response;
}

function sanatizeParams(params: any): any {
    if (params.previous) params.previous = decode(params.previous);
    if (params.next) params.next = decode(params.next);

    // If limit not passed , default to 1
    if (params.limit < 1) params.limit = 1

    if (params.fields) {
        if (!params.fields[params.paginatedField]) {
            params.fields[params.paginatedField] = 1;
        }
    }

    return params
}

function generateCursorQuery(params: any): any {
    if (!params.next && !params.previous) return {};

    const sortAsc = (!params.sortAscending && params.previous) || (params.sortAscending && !params.previous);
    const comparisonOp = sortAsc ? '$gt' : '$lt';

    const op = params.next || params.previous;

    // const shouldSecondarySortOnId = params.paginatedField !== '_id';
    // if (shouldSecondarySortOnId) {
    //     return {
    //         $or: [{
    //             [params.paginatedField]: {
    //                 [comparisonOp]: op[0]
    //             }
    //         }, {
    //             [params.paginatedField]: {
    //                 $eq: op[0]
    //             },
    //             _id: {
    //                 [comparisonOp]: op[1]
    //             }
    //         }]
    //     };
    // }

    return {
        [params.paginatedField]: {
            [comparisonOp]: op
        }
    };
}

function generateSort(params: any) {
    const sortAsc = (!params.sortAscending && params.previous) || (params.sortAscending && !params.previous);
    const sortDir = sortAsc ? 1 : -1;
    // const shouldSecondarySortOnId = params.paginatedField !== '_id';
    // if (shouldSecondarySortOnId) {
    //     return {
    //         [params.paginatedField]: sortDir,
    //         _id: sortDir
    //     };
    // }

    return {
        [params.paginatedField]: sortDir
    };
}

function prepareResponse(results: any, params: any): any {
    const hasMore = results.length > params.limit;
    // const shouldSecondarySortOnId = params.paginatedField !== '_id';
    const shouldSecondarySortOnId = false
    // Remove the extra element that was added to see if there were more entries.
    if (hasMore) results.pop();

    const hasPrevious = !!params.next || !!(params.previous && hasMore);
    const hasNext = !!params.previous || hasMore;

    // If we sorted reverse to get the previous page, correct the sort order.
    if (params.previous) results = results.reverse();
    const response = {
        results,
        previous: results[0],
        hasPrevious,
        next: results[results.length - 1],
        hasNext
    };


    if (response.previous) {
        const previousPaginatedField = objPath.get(response.previous, params.paginatedField)
        if (shouldSecondarySortOnId) {
            response.previous = encode([previousPaginatedField, response.previous._id]);
        } else {
            response.previous = encode(previousPaginatedField);
        }
    }
    if (response.next) {
        const nextPaginatedField = objPath.get(response.next, params.paginatedField);
        if (shouldSecondarySortOnId) {
            response.next = encode([nextPaginatedField, response.next._id]);
        } else {
            response.next = encode(nextPaginatedField);
        }
    }

    return response;
}

// Url safe base 64 encoding
function b64encode(str: string) {
    return escape(Buffer.from(str, 'utf8').toString('base64'))
}

function b64decode(str: string) {
    return Buffer.from(unescape(str), 'base64').toString('utf8')
}

function unescape(str: string) {
    return (str + '==='.slice((str.length + 3) % 4))
        .replace(/-/g, '+')
        .replace(/_/g, '/')
}

function escape(str: string) {
    return str.replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '')
}

function encode(obj: any): string {
    return b64encode(EJSON.stringify(obj))
}

function decode(str: string): any {
    return EJSON.parse(b64decode(str))
}

// Mongoose plugin, so that paginate method is attached to the model
export function mongoosePaginatePlugin(schema: mongoose.Schema) {
    const fn = function (params: any) {
        //@ts-ignore
        if (!this.collection) {
            throw new Error('collection property not found');
        }

        //@ts-ignore
        return paginate(this.collection, params);
    }

    schema.statics.paginate = fn;
}