# Product Specifications

## User Management

### Roles:

Suggestions for predefined roles
1. **Super** Admin - Has all the user management privaleges
3. **User** - Has no user management privileges

New roles can be created with a permutation of the below mentioned user management Privleges. Each user is assigned a default *User* role when created. 

### Privleges 
These current privalages for user management needed for first version of the application are listed below. More privalages can be added and integrated in the future easily as scope expands.

1. **Create** -  Can Create a new user or users
2. **Update** - Can update certain user attributes
    1. Name (Within the organization, not the user profile)
    2. Role
    2. Reset Password
    3. Force Password Change
    4. Add/Remove addresses - If a user is allowed to have multiple addresses then admin can manage them
    5. Suspend Users
3. **Read**
    1. Storage Information - How much storage is the current user using
    2. Settings - Can view certain settings. *Needs requirements*
    3. Login Events - Can view all the login related events for a user
    4. User Profile - Can view any user's User Profile 
3. **Delete** - Can delete any user

## API's 
These are just a summary of all the apis that will be provided. A more detailed doc with request and response will be added in future.

1. **Address**
    1. Add a new email address for a User
    2. Delete an existing Address
    3. Get Address info
    4. List All Addresses for a User
    5. Update Address information
2. **Auth**
    1. Authenticate (login) user
    2. Logout User
3. **Mailboxes**
    1. Create new custom Mailbox
    2. Delete a custom Mailbox
    3. List all Mailboxes for a User
    4. Update Mailboxes for a User (System Mailboxes can not be updated, Only custom mailboxes can be)
4. **User**
    1. Create New User or Users
    2. Delete a User or Users
    3. List all Users (paginated)(For user management view)
    4. Update User Attributes
        1. Change Password
        2. Change Role
        3. Update User profile
        4. Update User Settings
    5. Get User info
        1. Get Profile info
        2. Get Settings info
        3. Get Usage and Quota info
        4. Get Events (From the events collection)
5. **Messages**
    1. List Messages in a Mailbox 
    2. Search Messages (paginated) (Based on some filter values like from , to , subject , date)
    3. Delete a message or Messages
    4. Delete all messages from a mailbox
    5. Get a particular message 
    6. Get a particular thread
    7. Create and Update a draft message
    8. Update a message
        1. Update message flags 
        2. Move a message to a different mailbox
    9. Download Message attachment
    10. Send 
        1. Send a new Message
        2. Forward an existing message
        3. Reply to an existing message

## Collections 

### Users:
User collection stores all the user information like passwords, profile and user level settings
```
users {
    _id<bson>
    role<string>
    username<string>
    profile {
        First name<string>
        Last name<string>
        // Plus other profile, *Need requirements*
    }
    password<string:hash>
    seed<string:hash> // Password encryption seed
    primeAddress<bson> // This has the address_id of the primary address, in case where a user can have multiple addresses
    disabled<bool> // If the admin has disabled the user
    created_at<int64:unix timestamp>
    updated_at<int64:unix timestamp>
    lastLogin {
        time<int64:unix timestamp>
        event<bson> // event_id
    }
    settings {

    } // user settings. *Need requirements*
    quotas: {
        storageQuota<int64>
        maxInbound<int64>
        maxOutbound<int64>
    }
    metadata {

    } // a map of other metadatas about the user 
} 
```

### Addresses
Addresses collection has information about all the email addresses belonging to a user (If support for multiple addresses for one user is needed)
```
addresses {
    _id<bson>
    user<bson> // User id
    host<string> // eg John.Doe
    domain<string> // eg bizgaze.com
    address<string> // eg John.Doe@bizgaze.com
    storageUsed<int64>
    created_at<int64:unix timestamp>// timestamp
}
```

### Threads
Threads are used to link multiple messages into one email thread/collection
```
threads {
    _id<bson>
    user<bson> //User id
    address<bson> //Address id
    subject<string> // cleaned thread subject. ie prefixes like Re: and Fwd: are cleaned before storing
    referenceIds<[string]> // array of reference-id message headers of the messages that belong to the thread. This is used to decide if an incoming message should be added to an existing thread 
    participents<[string]> // array of email addresses of all the participents in the thread
    created_at<int64:unix timestamp>
    updated_at<int64:unix timestamp>
}
```

### Attachments
Attachments are stored in mongoDB using Gridfs. Gridfs creates 2 collections, **chunks** that stores the binary chunks and **files** that stores the file’s metadata.
```
files {
    _id<bson> //
    length<int64> //The size of the document in bytes
    chunkSize<int64> // The size of each chunk in bytes
    uploadDate<int64:timestamp> // The date the document was first stored in GridFS
    filename <string> //Optional file name
    metadata {

    } // a map of other metadatas about the file 
}
```

```
chunks{
    _id<bson>
    files_id<bson>
    n<int64> // The sequence number of the chunk. GridFS numbers all chunks, starting with 0
    data<bson> // The chunk’s payload as a BSON Binary type
}
```

### Messages
messages collection stores the actual emails

```
messages{
    _id<bson>
    root_id<bson> // IMAP allows copying of mails. So this flag can be used to track the root message
    epx<bool> // When message moved to a mailbox that has limited retention , eg JUNK or TRASH, this will be true
    retentionDate<int64:timestamp> // Date at which its retention expires
    userRemoved<bool> // If the original user of this message has been disabled by this admin
    idate<int64:timestamp> // internal date for IMAP server, As specified in [RFC3501](https://tools.ietf.org/html/rfc3501), section 2.3.3
    size<int64> // total message envelope headers and body size in Bytes. This does not include the attachment size.
    parsedHeaders<map<string,string>> // Parsed message headers, eg. 
    messageId<string> //unique messageId as given in the header
    draft<bool> // True if the message is a draft
    subject<string> // message subject
    copied<bool> // Used in IMAP. True if message was copied to another mailbox
    attachments [
        {
            files_id<bson>
            filename<string>
            contentType<string> //MIME type
            contentDisposition<string> // As specified in [RFC2183](https://tools.ietf.org/html/rfc2183)
            transferEncoding<string> // eg. Base64
            related<bool> //Was this attachment found from a multipart/related node. This usually means that this is an embedded image
        }
    ]
    flags {
        seen<bool>
        starred<bool>
        important<bool>
    }  // Default flags for a message 
    body {
        isHTML<bool>
        contentType {
            value<string>
            params<map<string,string>> // Can be nill for certain content types
        }
        bodyEncoding<string>
        bodyContent<string>
        children<body[]> // Message body can have many nested levels.If children is `null` that means its the end of nesting.
    }
    mailbox_id<bson> // Mailbox id of the mailbox the message is currently in
    user_is<bson>
    address_id<bson>
    uid<int64> // Unique Identifier to be used by IMAP server, As specified in [RFC3501](https://tools.ietf.org/html/rfc3501), section 2.3.1.1
    modseq<int64> // For IMAP server , as specified in [RFC4551](https://tools.ietf.org/html/rfc4551), section 1
    thread_id<bson> // Id of the thread this message belongs to
}
```

### Mailboxes
mailboxes collection stores the info about all the mailboxes for a user. They can default mailboxes (eg Inbox) or user created mailboxes. 
```
mailboxes {
    _id
    name<string> // Web mail mailbox names
    imapName<string:utf7> // As described in RFC3501](https://tools.ietf.org/html/rfc3501), section 5.1, IMAP Mailbox names are 7-bit
    specialUse<string> // Some mailboxes in IMAP server are defined to be special-use, which is used by the IMAP client to configure it self. Its described in RFC6154](https://tools.ietf.org/html/rfc6154)
    delimiter<string> // This is used to define hierarchy, for example INBOX/work. The same hierarchy delimiter character is used for all levels of hierarchy within a single mailbox, RFC3501](https://tools.ietf.org/html/rfc3501), section 5.1 
    uidValidity<int32> // Needed for IMAP server. As specified in [RFC3501](https://tools.ietf.org/html/rfc3501), section 2.3.1.1
    uid<int32> // Will be used to maintain a valid uidValidity
    modifyIndex<int64> //  Will be used to maintain a valid uidValidity
    subscribed<bool> // Needed for IMAP server. Set true when the mailbox is subscibed to by the client. In IMAP, subscriptions are used as a way of marking which folders should be displayed by IMAP. Client can unsubscribe if needed.
    retention<bool> // Its true for mailboxes like TRASH, where messages have a temporary retention and deleted after the `retentionTime` expires
    retentionTime<int64> // Retention time in ms, can be configured.
    user_id<bson>
    address_id<bson>
}
```

### Eventlogs
Eventlogs collection will persist some server events for a user, for example login event etc.
```
eventlogs {
    id<bson>
    user_id<bson>
    action<string> // taken from a list of predefined server actions, like "ACCOUNT_CREATED"
    meta<map<string, string>> // Meta data about the event. Will vary according to the action
}

```

### Buckets
Buckets are a way to organize users files and attachents. Right now its just simple boxes to put files into. Every user will have a default bucket per address into which all the attachment files will go. More properties and complete directory like functionality can be added in the future. 

```
buckets {
    user_id<bson> // The user that the bucket belongs to
    address_id<bson> // The adress for that bucket
    name<string>
    size<int64> // Bytes
    metadata<map<string, string>>
    // TODO: In future , can have an file abstraction over fridfs documents instead of directly refering to gridfs documents in the files array.
    files: [<ObjectId>] // array of file object references
}
```
