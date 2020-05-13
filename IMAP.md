# IMAP related info

## List of all rfc's that were refered during imap server implementation
https://tools.ietf.org/html/rfc2646
https://tools.ietf.org/html/rfc3676
https://tools.ietf.org/html/rfc822
https://tools.ietf.org/html/rfc2822
https://tools.ietf.org/html/rfc3501
https://tools.ietf.org/html/rfc4551
https://tools.ietf.org/html/rfc7162
https://tools.ietf.org/html/rfc6154
https://tools.ietf.org/html/rfc5258
https://tools.ietf.org/html/rfc2231

## Imap command parser and compiler (imapCommandParser.ts and imapCommandCompiler.ts)
These modules help in parsing imap commands as defined in rfc3501 and then compiling a json structure into
a valid imap command

The following internally defined data types are used

1) SECTION: Anything between []. Also includes partials that are values between <>. For example Fetch command
ie. TAG FETCH 1 (BODY[1.2.TEXT]<0.2048>) , here **"[1.2.TEXT]<0.2048>"** is a `SECTION` data 

2) ATOM: Any string that does not have rfc3501 defined special charecters. For example all commands are atoms

3) TEXT: A normal string

4) LIST: Any single space seperated string between (). For example TAG FETCH 1 (FLAGS INTERNALDATE).
Here **"(FLAGS INTERNALDATE)"** is a `LIST` data. 

5) NUMBER: An int value

6) LITERAL: An array of octets. (a Buffer)

7) SEQUENCE: A text in the form of <string>:<string>. For example TAG FETCH 1:* (FLAGS).
Here **"1:*"** is a `SEQUENCE` data. 

For example

For the following command: **A1 FETCH *:4 (BODY[HEADER.FIELDS ({4}\r\nDate Subject)]<12.45> UID)**

The parsed object will look like this:

```json
{
    "tag": "A1", // string containing the tag 
    "command": "FETCH", // first element after tag
    "attributes": [
        [
            {
                "type": "SEQUENCE",
                "value": "*:4"
            },
            {
                "type": "ATOM",
                "value": "BODY",
                // If section or partial values are not specified in the command, 
                // the values are also missing from the ATOM element
                "section": [  
                    {
                        "type": "ATOM",
                        "value": "HEADER.FIELDS"
                    },
                    [
                        {
                            "type": "LITERAL",
                            "value": "Date"
                        },
                        {
                            "type": "ATOM",
                            "value": "Subject"
                        }
                    ]
                ],
                "partial": [
                    12,
                    45
                ]
            },
            {
                "type": "ATOM",
                "value": "UID"
            }
        ]
    ]
}
```

### Compiler
Threre are 2 types of compilers, normal and streaming. Both take in in a JS object as defined above. It can be self generated or can be the output of the parser.

Normal Compiler gives back a command string. 
The stream compiler returns a stream that can be piped to the tcp socket. The stream compiler is used for commands
like fetch where we have a literal in the response. 
