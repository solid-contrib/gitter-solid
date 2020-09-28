# solid-gitter
A command line or batch processing tool to move data from [gitter](https://gitter.im)
chat into a [solid](https://solid.inrupt.net/) pod.

Do you have a projects which use gitter chats, but you would like to do do solid things
with them, like bookmark chat messages, and so on?
Do you have a lot of your projects institutional memory in gitter chats, and worry about
it gitter going away one day, or being offline?  Do you want to be able to use and build all kinds of search and
analysis tools on top of your gitter chat data?  Maybe you should be using this script.


## Usage
### Solid access

You will need to give your script access to solid account which will have write access
to the pod where you will be storing the solid chat.   This is done in any of the ways
`solid-auth-cli` can puck up credentials, such as a file in yor home directory.

### Gitter access

You will need to give the script access to the gitter world, which means to get a gitter token.
See https://developer.gitter.im/docs/welcome   .

[Get a token](https://developer.gitter.im/apps).

Then you can save it and pass it to this program as an environment variable.

Syntax for example:
```
export GITTER_TOKEN=W4gfhEf6XO4+p1bfTEHy3ncEVDUTksI2pYMryWhO4ZbhQrq2229Bm
npm install
node gitter-solid.js   list

```
One you have set your shell session up with the gitter token,
you can use gitter-solid repeatedly.

## Gitter rooms

In gitter, the concept of a room includes public rooms, private rooms, and private 1-1 conversations, some call *direct messaging*.

  syntax | effect
  -------|-----------------------
  `node gitter-solid.js list` | List your gitter rooms
  `node gitter-solid.js list public` | List your public rooms
  `node gitter-solid.js list private` | List your private rooms
  `node gitter-solid.js list direct` | List your direct messaging 1:1 chats


  1:1 chats in this program (only) are named  using an '@' sign followed by the gitter name of the person
  you are chatting with.

  ## Places to store the chat

  It is important to make sure that creating a copy of
  chat data in a solid pod does not give anyone access to is
  who would not have access to it on gitter.   Particularly, don't make any chat
  data public unless it was a public chat on gitter.

  To make this easier, `gitter-solid` uses three different solid folder for each type of chat.
  These locations are stored in your pod, in a gitter preferences file. If
  you have not defined them already, gitter-solid will prompt you for them.
  Give the whole URI.

Example

```
This must a a full https: URI ending in a slash, which folder on your pod you want gitter chat stored.
URI for publicChatFolder? https://timbl.com/timbl/Public/Archive/

```

 ## Syntax

 The syntax of a command line takes two parameters, a command and a room.

   `node gitter-solid.js  ` *command*  *room*


   Where room is either a single room or set of rooms

   room | means
   ----------|-----------------------
   `solid/chat`  |  A single gitter room
   `@joeBloggs`  |  Your direct message chat room with gitter user joeBloggs
   `public`  |  All your public rooms
   `private`  |  All your your private rooms
   `direct`  |  All your direct messaging 1:1 chats
   `all`  |  All of your rooms (public or private) and chats


   and where *command* is one of the following.

 ### init command

 This creates an empty solid chat channel correspondiing to the given room or rooms. No messages are transferred.

 ### create command

 This creates an new, as init does, then does catchup to local recent messages, and then and *acrhive* to  go back into the gitter room aarchive copying it into the solid archibe, going backward through time. Check the logs that nothing went wrong.
 This should bring a new solid chat channel into creation and bring it up to date.

 ### archive command

Go to the earliest message in the current soldd chat channel, and go back through gitter history to attempt
to bring it all over into solid.

 ### catchup command

 Starting with hte most recent messages, pull in recent gitter messages, and tranfer them to solid, going backwards in time, until
 a message is found which has already been trasnfereed, then assume  solid is then up to date.

 ### stream command

 Do  a *catchup* command as above them, listen to for any new messages (Events) on the gitter room. When they arrive, add new messages to the solid, or delete ior modify existing messages accoriding to the gitterr event.  This command causes th eprogram to hang in the command line shell without returning.   Streemin more than one room at a time has not been tested.

 ## Notes

 Bugs/Ideas reports please [on githiub](https://github.com/solid/gitter-solid/issues/)

 The gitter API limits requests, rumor has it, to 100 a minute, so an average of around 1.7Hz.  gitter-solid tries to limit itself, partly pausing every now and again.

 ENDS
