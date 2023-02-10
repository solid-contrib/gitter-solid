// Class to convert Matrix & Gitter message objects into a standardised thing
export default class Message {
  constructor (messageObject, matrix=true) {
    this.matrix = matrix;
    if (matrix) {
        this.id = messageObject.event_id;
        this.maker = messageObject.sender;

        console.log("--content--")
        this.content = messageObject.content.body;
        if (messageObject.content.formatted_body) {
            this.richContent = messageObject.content.formatted_body;
        }
        else {
            this.richContent = null   
        }
        // TODO implemenet relates_to and in_reply_to?

        this.created = new Date(messageObject.age)
        this.modified = null


        console.log(this.content)
    } else {
        // Source is gitter
        this.id = gitterMessage.id;
        this.maker = null;

        this.content = messageObject.text;
        if (messageObject.html && messageObject.html !== messageObject.text) { // is it new information?
            this.richContent = messageObject.html
        } else {
            this.richContent = null;
        }

        this.created = new Date(messageObject.sent);  // Like "2014-03-25T11:51:32.289Z"
        this.modified = messageObject.edited ? new Date(messageObject.edited) : null 
    
    }
  }
}
