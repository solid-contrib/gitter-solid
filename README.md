# gitter-solid

A command line or batch processing tool to move data from [gitter](https://gitter.im)
chat into a [solid](https://solid.inrupt.net/) pod.

Do you have projects which use gitter chats, but you would like to do solid things
with them, like bookmark chat messages, and so on?
Do you have a lot of your projects institutional memory in gitter chats, and worry about
gitter going away one day, or being offline? Do you want to be able to use and build all kinds of search and
analysis tools on top of your gitter chat data? Maybe you should be using this script.


## Usage
### Solid access

If you will be storing your chats on the local filesystem, you don't need Solid access.

If you will be storing your chats on a Solid Pod (either local or remote), you will need to provide login credentials to give your script write access.   You can export enviornoment variables (SOLID_IDP, SOLID_USERNAME, SOLID_PASSWORD) or let the script prompt you for the values if the environment variables are not found.

**Note:** the [password flow](https://github.com/solid-contrib/solid-node-client#authentication-using-usernamepassword) used in this repository is only compatible with NSS (Node Solid Server).

### Gitter access

You will need to give the script access to the gitter world, which means to get a gitter token. See https://developer.gitter.im/docs/welcome   .

[Get a token](https://developer.gitter.im/apps).

Then you can save it and pass it to this program as an environment variable (GITTER_TOKEN) or if no environment variable exists, you can let the script prompt you for it.

Syntax for example:
```
export GITTER_TOKEN=W4gfhEf6XO4+p1bfTEHy3ncEVDUTksI2pYMryWhO4ZbhQrq2229Bm
npm install
node gitter-solid.js   list

```

Once you have set your shell session up with the gitter token,
you can use gitter-solid repeatedly.

## Gitter rooms

In gitter, the concept of a room includes public rooms, private rooms, and private 1-1 conversations, some call *direct messaging*.

  syntax | effect
  -------|-----------------------
  `node gitter-solid.js list` | List your gitter rooms
  `node gitter-solid.js list public` | List your public rooms
  `node gitter-solid.js list private` | List your private rooms
  `node gitter-solid.js list direct` | List your direct messaging 1:1 chats


  1:1 chats in this program (only) are named using an '@' sign followed by the gitter name of the person
  you are chatting with.

  ## Places to store the chat

  You will be asked if you want to store the chat remotely. If you answer
  no, you will be prompted for a local file location (see below). 
  In either case,  you will then be prompted to give the locations of the 
  folder for different kinds of chats.

  The separate folders are necessary when using a server-based pod, because it is important to make sure that creating a copy of
  chat data in a solid pod does not give anyone access to it
  who would not have access to it on gitter. Particularly, don't make any chat
  data public unless it was a public chat on gitter.

  To make this easier, `gitter-solid` uses three different solid folders for each type of chat.
  These locations are stored in your pod, in a gitter preferences file. If
  you have not defined them already, gitter-solid will prompt you for them.
  Give the whole URI.

Example

```
This must be a full https: or file: URI ending in a slash, which folder on your pod you want gitter chat stored.
URI for publicChatFolder? https://timbl.com/timbl/Public/Archive/
or
URI for publicChatFolder? file:///home/jeff/myPod/Public/Archive/
```

 ## Syntax

 The description of command, room, and optionalPodURI, are shown below as
 parameters to the command line. You may also simply type **node gitter-solid** and let the script prompt you for the command, room, and URI.

 The syntax of a command line takes two parameters, a command and a room.

   `node gitter-solid.js  ` *command* *room* *optionalLocalPodURI*


   Where optionalLocalPod

   and where room is either a single room or set of rooms

   room | means
   ----------|-----------------------
   `solid/chat`  |  A single gitter room
   `@joeBloggs`  |  Your direct message chat room with gitter user joeBloggs
   `public`  |  All your public rooms
   `private`  |  All your private rooms
   `direct`  |  All your direct messaging 1:1 chats
   `all`  |  All of your rooms (public or private) and chats


   and where *command* is one of the following.

 ### init command

 This creates an empty solid chat channel correspondiing to the given room or rooms. No messages are transferred.

 ### create command

 This creates an new empty solid chat channel, as init does, then does catchup to local recent messages, and then add *acrhive* to go back into the gitter room archive copying it into the solid archive, going backward through time. Check the logs that nothing went wrong.
 This should bring a new solid chat channel into creation and bring it up to date.

 ### archive command

Go to the earliest message in the current gitter chat channel, and go back through gitter history to attempt
to bring it all over into solid.

 ### catchup command

 Starting with the most recent messages, pull in recent gitter messages, and tranfer them to solid, going backwards in time, until
 a message is found which has already been trasnferred, then assume solid is up to date.

 ### stream command

 Do a *catchup* command as above then, listen for any new messages (Events) on the gitter room. When they arrive, add new messages to the solid, or delete or modify existing messages accoriding to the gitter event. This command causes the program to hang in the command line shell without returning.   Streaming more than one room at a time has not been tested.

 ## Storing chats locally

 If you wish to store your chats locally without installing a Solid server,
 you can supply a file: URL pointing to the local place you'd like the 
 archive to be stored. Supply this either on the command-line as the third argument, or let the script prompt you for it.

 The first time you specify this location you will be prompted to
 create a serverless Pod at that location and if you agree, a profile,
 preferences file, and other key pod resources will be created.

 Once you have created a local pod, the process is the same as for
 storing the archive on a server - gitter-solid follows its nose
 from your webId, to your profile, to your preferences file, and 
 then prompts you to add a gitterConfiguration file to your preferences.

  You can edit your profile and other pod documents as needed and also
  reuse them for other local apps such as Data-Kitchen and solid-shell.

 ## Notes

 Bugs/Ideas reports please [on githiub](https://github.com/solid-contrib/gitter-solid/issues/)

 The gitter API limits requests, rumor has it, to 100 a minute, so an average of around 1.7Hz. gitter-solid tries to limit itself, partly pausing every now and again.

 ENDS
