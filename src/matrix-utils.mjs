import { show } from "./utils.mjs"


export function setRoomList(matrixClient) {
    let roomList = matrixClient.getRooms();
    console.log('   setRoomList ' + show(roomList))
    roomList.sort(function (a, b) {
        // < 0 = a comes first (lower index) - we want high indexes = newer
        var aMsg = a.timeline[a.timeline.length - 1];
        if (!aMsg) {
            return -1;
        }
        var bMsg = b.timeline[b.timeline.length - 1];
        if (!bMsg) {
            return 1;
        }
        if (aMsg.getTs() > bMsg.getTs()) {
            return 1;
        } else if (aMsg.getTs() < bMsg.getTs()) {
            return -1;
        }
        return 0;
    });
    return roomList;
}