const config = require("../../utils/config");
const Users = require("./../user");
const Player = require("./components/player");
const Card = require("./components/card");
const Logger = require("../logger");

const FACES = [
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
];
const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10];
const SUITS = ["SPADES", "HEARTS", "DIAMONDS", "CLUBS"];
const PHASES = [
    { phase: "waiting", anims: ["ready"] },
    { phase: "betting", anims: ["bet"] },
    { phase: "deal", anims: ["deal", "draw"] },
    { phase: "player phase", anims: ["player action", "draw"] },
    { phase: "three card", anims: ["three card"] },
    { phase: "banker phase", anims: ["banker action", "draw"] },
    { phase: "results", anims: ["results"] },
];
const HIDDEN = { img: "hidden" };

function newDeck() {
    return new Array(52)
        .fill(0)
        .map((c, i) => new Card(SUITS[i % 4], FACES[i % 13]));
}

class Room {
    constructor(room, index, rank) {
        // lobby
        this.roomnumber = room;
        this.players = new Array(config.MAXPLAYERS).fill(undefined);
        this.spectators = [];
        this.phaseIndex = 0;
        this.minimumbank =
            index >= config[rank].ROOMS_1
                ? config[rank].BANK_2
                : config[rank].BANK_1;

        // room
        this.bank = 0;
        this.bankerIndex = -1;
        this.warning = -1;
        this.coins = {};
        this.winners = [];
        this.losers = [];

        // internal
        this.revealed = [];
        this.deposit = true;
        this.actions = [];
        this.deals = {};
        this.draws = 0;
        this.sorted = [];
        this.betTotal = 0;
        this.reserved = 0;
        this.nextPhase = this.start;

        // misc
        this.leavers = [];
        this.standers = [];
        this.bankerQueue = [];
        this.deck = newDeck();
        this.gamesPlayed = 0;
        this.houseProfit = 0.0;
        this.fees = 0;
        this.timer = undefined;
    }

    enter(user, socket, io) {
        if (
            !this.spectators.includes(user.sid) &&
            this.findPlayer(user.sid) === -1
        )
            this.spectators.push(user.sid);
        user.room = this.roomnumber;
        Logger.respLog(
            "resp_room_enter",
            { retcode: 0, ...this.filterRoomState(user) },
            "success"
        );
        socket.emit("resp_room_enter", {
            retcode: 0,
            ...this.filterRoomState(user),
        });
    }

    ready(user, socket, io) {
        if (
            !this.spectators.includes(user.sid) &&
            this.findPlayer(user.sid) === -1
        )
            return;
        Logger.respLog("resp_ingame_imready", { retcode: 0 }, "success");
        socket.emit("resp_ingame_imready", {
            retcode: 0,
            ...this.filterRoomState(user),
        });
        let p = this.findPlayer(user.sid);
        if (p === -1) socket.join(this.roomnumber);
        else this.players[p].inRoom = true;
    }

    getSeated(data, user, socket, io) {
        if (typeof this.players[data.seatIndex] !== "undefined") {
            socket.emit("resp_ingame_sit", { retcode: 1 });
            return;
        }
        let p = this.findPlayer(user.sid);
        if (p === -1) {
            this.spectators = this.spectators.filter((s) => s !== user.sid);
            socket.leave(this.roomnumber);
            this.players[data.seatIndex] = new Player(socket, data.seatIndex);
            if (this.bankerIndex === -1) {
                this.bankerIndex = user.sid;
                this.players[data.seatIndex].banker = true;
            }
            this.bankerQueue.push(user.sid);
            socket.emit("resp_ingame_sit", {
                retcode: 0,
                ...this.filterRoomState(user),
            });
            this.piggyback(
                "srqst_ingame_newuser",
                {
                    ...this.filterPlayer(this.players[data.seatIndex]),
                },
                io
            );
        } else {
            if (this.phaseIndex !== 0 || this.phaseIndex !== 6) {
                socket.emit("resp_ingame_sit", { retcode: 1 });
                return;
            }
            this.players[data.seatIndex] = this.players[p];
            this.players[p] = undefined;
            socket.emit("resp_ingame_sit", {
                retcode: 0,
                ...this.filterRoomState(user),
            });
            this.piggyback(
                "srqst_ingame_newuser",
                {
                    ...this.filterPlayer(this.players[data.seatIndex]),
                },
                io
            );
        }
        if (this.seatedPlayers() === 3) this.nextPhase(io);
    }

    leave(user, socket, io, disconnect) {
        // spectator logic
        if (this.spectators.includes(user.sid)) {
            this.spectators = this.spectators.filter((s) => s !== user.sid);
            socket.leave(this.roomnumber);
            socket.emit("resp_ingame_leave", {
                retcode: 0,
            });
            socket.emit("srqst_ingame_leave", {
                sid: user.sid,
                roomnumber: this.roomnumber,
            });
            Logger.respLog("resp_ingame_leave", { retcode: 0 }, "success");
            Logger.respLog(
                "srqst_ingame_leave",
                {
                    sid: user.sid,
                    roomnumber: this.roomnumber,
                },
                "success"
            );
            user.room = undefined;
            return;
        }

        let p = this.findPlayer(user.sid);
        if (p === -1) return;
        let player = this.players[p];
        let found = false;

        this.leavers.forEach((leaver) => {
            if (leaver.user.sid === user.sid) found = true;
        });

        if (!found)
            socket.emit("resp_ingame_leave", {
                retcode: 0,
            });

        if (player.isActive && this.phaseIndex !== 0) {
            if (disconnect) player.inRoom = false;
            this.leavers.push({ user, socket });
            return;
        }

        // banker logic
        if (this.bankerIndex === player.sid && this.playerCnt() > 1) return;
        // player logic
        if (this.bankerIndex === user.sid) {
            this.nextBanker();
            player.balance += this.bank;
            Users.changeCash(user, this.bank);
            this.bank = 0;
        }
        this.bankerQueue = this.bankerQueue.filter((b) => b !== user.sid);
        socket.leave(this.roomnumber);
        this.piggyback(
            "srqst_ingame_leave",
            {
                sid: user.sid,
                roomnumber: this.roomnumber,
            },
            io
        );
        this.leavers = this.leavers.filter(
            (leaver) => leaver.user.sid !== user.sid
        );
        this.players[p] = undefined;
        user.room = undefined;
        user.playing = false;
    }

    leaveCancel(user, socket, io) {
        if (this.leavers.includes(user.sid)) {
            this.leavers = this.leavers.filter((sid) => sid !== user.sid);
            socket.emit("resp_ingame_leavecancel", { retcode: 0 });
        }
    }

    start(io) {
        this.phaseIndex = 0;
        let bankerLeave = undefined;
        this.leavers.forEach((leaver) => {
            if (leaver.user.sid === this.bankerIndex) bankerLeave = leaver;
            else this.leave(leaver.user, leaver.socket, io);
        });
        if (bankerLeave) this.leave(bankerLeave.user, bankerLeave.socket, io);

        console.log("---start---");
        this.nextPhase = this.betting;
        this.betTotal = 0;
        this.winners = [];
        this.losers = [];
        this.revealed = [];
        this.coins = {};
        this.totalDraws = 0;
        this.deals = {};
        this.deck = newDeck();
        this.players.forEach((p) => {
            if (typeof p !== "undefined") {
                p.isActive = true;
                p.cards = [];
                this.deals[p.sid] = 0;
                p.bet = 0;
                let user = Users.getUser(p.sid);
                user.playing = true;
            }
        });
        if (this.seatedPlayers() < 2) {
            this.nextPhase = this.start;
            return;
        }

        if (this.deposit) {
            let p = this.findPlayer(this.bankerIndex);
            this.warning = -1;
            this.players[p].balance -= this.minimumbank;
            this.bank += this.minimumbank;
            this.coins[Math.floor(this.bank / 10)] = 10;
            Users.changeCash(
                Users.getUser(this.bankerIndex),
                -this.minimumbank
            );
        }
        this.nextPhase(io);
    }

    betting(io) {
        this.phaseIndex = 1;
        this.resetPlayers();
        this.clearTimer(io);
        this.setTimer(io);
        console.log("---bet---");
        this.piggyback(
            "srqst_ingame_gamestart",
            { bankerDeposit: this.deposit },
            io
        );
        if (this.deposit) this.deposit = false;
    }

    bet(data, user, socket, io) {
        if (typeof user === "undefined") return;
        let p = this.findPlayer(user.sid);
        if (
            this.phaseIndex !== 1 ||
            p === -1 ||
            !this.players[p].isActive ||
            this.bankerIndex === user.sid ||
            this.players[p].lastAction === "bet"
        )
            return;
        this.players[p].socket = socket;
        let bet = data.betAmount;
        this.players[p].bet = bet;
        this.players[p].balance -= bet;
        this.betTotal += data.betAmount;
        Users.changeCash(user, -bet);
        this.actions.push({
            sid: user.sid,
            betAmount: bet,
            coins: data.coins,
        });
        this.players[p].lastAction = "bet";
        if (typeof data.coins !== "undefined")
            Object.keys(data.coins).forEach((c) => {
                if (this.coins[c]) this.coins[c] += data.coins[c];
                else this.coins[c] = data.coins[c];
            });
        this.piggyback(
            "srqst_ingame_place_bet",
            {
                sid: user.sid,
                betAmount: bet,
                actions: this.actions,
            },
            io
        );
        if (this.checkActions()) {
            this.actions = [];
            this.deal(io);
        }
    }

    deal(io) {
        this.phaseIndex = 2;
        this.resetPlayers();
        this.clearTimer(io);
        this.setTimer(io);
        console.log("---deal---");
        this.nextPhase = this.playerActions;
        this.shuffle();
        let bWin = false;

        // 1002 testing room for banker auto-win
        if (this.roomnumber === 1002) {
            this.players.forEach((p) => {
                if (p && p.isActive) {
                    if (this.bankerIndex === p.sid) {
                        let c1 = { img: "HEARTS", num: "5" };
                        let c2 = { img: "HEARTS", num: "4" };
                        p.cards.push(c1);
                        p.cards.push(c2);
                        bWin = true;
                    } else {
                        let c1 = { img: "SPADES", num: "1" };
                        let c2 = { img: "SPADES", num: "2" };
                        p.cards.push(c1);
                        p.cards.push(c2);
                    }
                }
            });
        } else {
            this.players.forEach((p) => {
                if (typeof p !== "undefined" && p.isActive) {
                    p.cards.push(this.deck.pop());
                    p.cards.push(this.deck.pop());
                    if (this.cardsValue(p.cards).total >= 8)
                        if (this.bankerIndex === p.sid) bWin = true;
                        else this.revealed.push(p.sid);
                }
            });
        }

        if (bWin) this.nextPhase = this.results;
        else {
            this.revealed.forEach((sid) => this.winners.push(sid));
            if (this.revealed.length === this.playerCnt() - 1)
                this.nextPhase = this.results;
        }
        this.piggyback("srqst_ingame_deal", {}, io);
    }

    playerActions(io) {
        this.phaseIndex = 3;
        this.resetPlayers();
        this.clearTimer(io);
        this.setTimer(io);
        console.log("---playeraction---");
        this.nextPhase = this.threeCard;
        this.piggyback("srqst_ingame_player_action", {}, io);
    }

    playerAction(data, user, socket, io, defaultAction) {
        let p = this.findPlayer(user.sid);
        if (
            this.phaseIndex !== 3 ||
            p === -1 ||
            !this.players[p].isActive ||
            user.sid === this.bankerIndex ||
            this.revealed.includes(user.sid) ||
            this.checkAction(user.sid)
        )
            return;
        this.players[p].socket = socket;
        if (data.action === "draw") {
            this.players[p].cards.push(this.deck.pop());
            this.totalDraws++;
        }
        this.actions.push({ sid: user.sid, action: data.action });
        this.players[p].lastAction = data.action;
        if (this.checkActions()) {
            this.piggyback(
                "srqst_ingame_player_action_update",
                {
                    actions: this.actions,
                },
                io
            );
            this.actions = [];
            if (defaultAction) this.confirm("player action", user, io);
        }
    }

    threeCard(io) {
        this.phaseIndex = 4;
        this.resetPlayers();
        this.clearTimer(io);
        this.setTimer(io);
        console.log("---threecard---");
        this.nextPhase = this.bankerActions;
        this.piggyback("srqst_ingame_three_card", {}, io);
    }

    bankerActions(io) {
        this.phaseIndex = 5;
        this.resetPlayers();
        this.clearTimer(io);
        this.setTimer(io);
        console.log("---bankeraction---");
        this.nextPhase = this.results;
        this.piggyback("srqst_ingame_banker_action", {}, io);
    }

    bankerAction(data, user, socket, io, defaultAction) {
        if (user.sid !== this.bankerIndex) return;
        let p = this.findPlayer(user.sid);
        if (typeof this.players[p].lastAction !== "undefined") return;
        this.players[p].socket = socket;
        if (this.phaseIndex === 4) {
            if (data === "threecard") {
                this.players.forEach((p) => {
                    if (
                        typeof p !== "undefined" &&
                        p.sid !== this.bankerIndex &&
                        p.cards.length === 3 &&
                        p.isActive
                    ) {
                        this.revealed.push(p.sid);
                        let result = this.result(p.cards);
                        if (result === -1) this.losers.push(p.sid);
                        else this.winners.push(p.sid);
                    }
                });
                if (
                    this.playerCnt() - 1 ===
                    this.losers.length + this.winners.length
                )
                    this.nextPhase = this.results;
            }
            this.piggyback("srqst_ingame_three_cards", {}, io);
            if (defaultAction) this.confirm("three card", user, io);
            return;
        }
        if (this.phaseIndex === 5) {
            if (data === "draw") {
                let p = this.findPlayer(this.bankerIndex);
                this.players[p].cards.push(this.deck.pop());
                this.piggyback(
                    "srqst_ingame_banker_action_update",
                    {
                        sid: this.bankerIndex,
                        action: "draw",
                    },
                    io
                );
                this.players[p].lastAction = "draw";
            } else {
                this.piggyback(
                    "srqst_ingame_banker_action_update",
                    {
                        sid: this.bankerIndex,
                        action: "pass",
                    },
                    io
                );
                this.nextPhase(io);
            }
        }
    }

    results(io) {
        this.phaseIndex = 6;
        this.resetPlayers();
        this.clearTimer(io);
        this.setTimer(io);
        console.log("---results---");
        this.nextPhase = this.start;
        this.bank += this.betTotal;
        let resultplayers = [];
        let reserved = 0;
        let sorted = [];
        this.players.forEach((p) => {
            if (
                typeof p !== "undefined" &&
                this.bankerIndex !== p.sid &&
                p.isActive
            ) {
                let result = this.result(p.cards);
                if (result === -1 && !this.winners.includes(p.sid)) {
                    if (!this.losers.includes(p.sid)) this.losers.push(p.sid);
                    resultplayers.push({
                        sid: p.sid,
                        result: 0,
                        balanceBefore: p.balance + p.bet,
                        balanceAfter: p.balance,
                        winAmt: 0,
                    });
                    if (p.balance < this.minimumbank)
                        this.bankerQueue = this.bankerQueue.filter(
                            (sid) => sid !== p.sid
                        );
                    if (
                        !this.bankerQueue.includes(p.sid) &&
                        p.balance > this.minimumbank
                    )
                        this.bankerQueue.push(p.sid);
                } else if (!this.losers.includes(p.sid)) {
                    reserved += p.bet;
                    if (!this.winners.includes(p.sid)) this.winners.push(p.sid);
                    sorted.push(p);
                }
            }
        });
        sorted = sorted.sort((a, b) => b.bet - a.bet);
        sorted.forEach((p) => {
            let user = Users.getUser(p.sid);
            let result = this.cardsValue(p.cards).multiplier;
            if (result === -1) result = 1;
            let winAmt = p.bet * result;
            reserved -= p.bet;
            let fee = winAmt - Math.ceil(winAmt * 0.95);
            winAmt += p.bet;
            if (winAmt > this.bank - reserved) {
                winAmt = this.bank - reserved;
                fee = 0;
            }
            this.fees += fee;
            winAmt -= fee;
            resultplayers.push({
                sid: p.sid,
                result,
                balanceBefore: p.balance,
                balanceAfter: p.balance + winAmt,
                winAmt: winAmt,
            });
            this.bank -= winAmt + fee;
            p.balance += winAmt;
            Users.changeCash(user, winAmt);
            if (p.balance < this.minimumbank)
                this.bankerQueue = this.bankerQueue.filter(
                    (sid) => sid !== p.sid
                );
            if (
                !this.bankerQueue.includes(p.sid) &&
                p.balance > this.minimumbank
            )
                this.bankerQueue.push(p.sid);
        });

        if (this.warning === 3) {
            let b = this.findPlayer(this.bankerIndex);
            let u = Users.getUser(this.bankerIndex);
            Users.changeCash(u, this.bank);
            let fee = Math.ceil(this.bank * 0.05);
            this.bank -= fee;
            resultplayers.push({
                sid: u.sid,
                balanceBefore: this.players[b].balance,
                balanceAfter: this.players[b].balance + this.bank,
                winAmt: this.bank,
            });
            this.players[b].balance += this.bank;
            this.bank = 0;
        }
        this.piggyback("srqst_ingame_result", { resultplayers }, io);
        if (this.bank >= this.minimumbank * 3 && this.warning === -1)
            this.warning = 1;
        else if (this.warning !== -1 && this.warning < 3 && this.bank > 0)
            this.warning++;
        if (this.bank <= 0) this.nextBanker();
    }

    nextBanker() {
        let current = this.findPlayer(this.bankerIndex);
        delete this.players[current].banker;
        let removed = this.bankerQueue.splice(0, 1);
        this.bankerQueue.push(removed[0]);
        let p = this.findPlayer(removed);
        if (
            this.bankerQueue.length > 0 &&
            this.bankerQueue[0] !== this.bankerIndex
        ) {
            let next = this.findPlayer(this.bankerQueue[0]);
            this.players[next].banker = true;
            this.bankerIndex = this.players[next].sid;
        } else this.bankerIndex = -1;
        this.warning = -1;
        this.deposit = true;
    }

    // confirming animations and checking actions

    checkActions() {
        for (let i = 0; i < this.players.length; i++) {
            let p = this.players[i];
            if (
                typeof p === "undefined" ||
                p.sid === this.bankerIndex ||
                this.revealed.includes(p.sid) ||
                !p.isActive
            )
                continue;
            if (!this.checkAction(p)) return false;
        }
        return true;
    }

    checkAction(player) {
        if (this.phaseIndex === 1 && player.lastAction === "bet") return true;
        if (
            this.phaseIndex === 3 &&
            (player.lastAction === "draw" || player.lastAction === "pass")
        )
            return true;
        return false;
    }

    confirm(data, user, io) {
        if (!PHASES[this.phaseIndex].anims.includes(data)) return;
        let p = this.findPlayer(user.sid);
        console.log(data);
        if (p !== -1) {
            console.log(data, this.players[p].confirm);
        }
        if (this.players[p].lastAction === "draw") {
            this.players[p].lastAction = undefined;
            return;
        }
        if (p !== -1) this.players[p].confirm = true;
        if (this.sync()) this.nextPhase(io);
    }

    sync() {
        for (let i = 0; i < this.players.length; i++) {
            let p = this.players[i];
            if (typeof p !== "undefined" && p.isActive && !p.confirm)
                return false;
        }
        return true;
    }

    // game

    shuffle() {
        for (let i = 0; i < 1000; i++) {
            let s1 = Math.floor(Math.random() * 52);
            let s2 = Math.floor(Math.random() * 52);
            let temp = this.deck[s1];
            this.deck[s1] = this.deck[s2];
            this.deck[s2] = temp;
        }
    }

    setTimer(io) {
        this.timer = setTimeout(() => {
            this.defaultAction(io);
        }, [10000]);
    }

    clearTimer(io) {
        clearTimeout(this.timer);
    }

    defaultAction(io) {
        this.players.forEach((player) => {
            if (typeof player !== "undefined" && !player.confirm) {
                let user = Users.getUser(player.sid);
                switch (this.phaseIndex) {
                    case 1:
                        if (this.bankerIndex === player.sid) break;
                        let data = {
                            betAmount: this.minimumbank,
                            coins: { [this.minimumbank]: 1 },
                        };
                        if (!this.checkAction(player))
                            this.bet(data, user, player.socket, io);
                        break;
                    case 2:
                        this.confirm("deal", user, io);
                        break;
                    case 3:
                        if (this.bankerIndex === player.sid) break;
                        let data2 = { action: "pass" };
                        if (!this.checkAction(player))
                            this.playerAction(
                                data2,
                                user,
                                player.socket,
                                io,
                                true
                            );
                        break;
                    case 4:
                        if (player.sid === this.bankerIndex)
                            this.bankerAction(
                                "pass",
                                user,
                                player.socket,
                                io,
                                true
                            );
                        break;
                    case 5:
                        if (player.sid === this.bankerIndex)
                            this.bankerAction("pass", user, player.socket, io);
                        break;
                    case 6:
                        this.confirm("results", user, io);
                        break;
                }
            }
        });
    }

    // card results

    cardsValue(cards) {
        let highCard = 0;
        let total = 0;
        let suits = [];
        let values = [];
        let multiplier = 1;
        cards.forEach((c, i) => {
            let card = this.cardValue(c);
            total = (total + card.value) % 10;
            if (!values.includes(card.value)) values.push(card.value);
            if (!suits.includes(card.suit)) suits.push(card.suit);
            if (card.high > highCard) highCard = card.high;
        });
        if (suits.length === 1) multiplier = 2;
        if (suits.length === 1 && cards.length === 3) multiplier = 3;
        if (values.length === 1 && cards.length === 3) multiplier = 5;
        return { highCard, total, multiplier };
    }

    cardValue(card) {
        let suit = SUITS.indexOf(card.img);
        let value = VALUES[FACES.indexOf(card.num)];
        let high = FACES.indexOf(card.num) + 1 + suit / 10;
        return { suit, value, high };
    }

    result(cards) {
        let pCards = this.cardsValue(cards);
        let b = this.findPlayer(this.bankerIndex);
        let bCards = this.cardsValue(this.players[b].cards);
        if (pCards.total > bCards.total) return pCards.multiplier;
        else if (pCards.total < bCards.total) return -1;
        else {
            if (cards.length < this.players[b].cards.length)
                return pCards.multiplier;
            else if (cards.length > this.players[b].cards.length) return -1;
            else return pCards.high > bCards.high ? pCards.multiplier : -1;
        }
    }

    // piggybacks

    piggyback(protocol, content, io) {
        Logger.respLog(
            protocol,
            { ...content, ...this.filterRoomState() },
            "phase - " + PHASES[this.phaseIndex].phase
        );
        this.players.forEach((p) => {
            if (typeof p !== "undefined") {
                let user = Users.getUser(p.sid);
                io.to(user.socket).emit(protocol, {
                    ...content,
                    ...this.filterRoomState(user),
                });
            }
        });
        io.to(this.roomnumber).emit(protocol, {
            ...content,
            ...this.filterRoomState(),
        });
    }

    // filter

    filterLobby() {
        let cnt = this.seatedPlayers();
        let status =
            this.phaseIndex !== 0 && this.phaseIndex !== 6
                ? "running"
                : cnt === 0
                ? "open"
                : cnt === 8
                ? "full"
                : "waiting";
        return {
            roomnumber: this.roomnumber,
            players: cnt,
            spectators: this.spectators.length,
            bank: this.minimumbank,
            status,
        };
    }

    filterPlayer(player) {
        let p = { ...player };
        delete p.lastAnimation;
        delete p.inRoom;
        delete p.socket;
        return p;
    }

    hiddenCards(length) {
        return new Array(length).fill(0).map((c) => {
            return { ...HIDDEN };
        });
    }

    filterRoomState(user) {
        return {
            ts: new Date().getTime(),
            roomnumber: this.roomnumber,
            players: this.players.map((p) => {
                if (typeof p !== "undefined") {
                    let player = { ...p };
                    delete player.inRoom;
                    delete player.socket;
                    delete player.confirm;
                    delete player.lastAction;
                    if (this.phaseIndex === 6) return player;
                    if (
                        this.revealed.includes(p.sid) ||
                        this.winners.includes(p.sid) ||
                        this.losers.includes(p.sid)
                    )
                        return player;
                    if (typeof user !== "undefined" && user.sid === p.sid)
                        return player;
                    player.cards = this.hiddenCards(player.cards.length);
                    return player;
                }
                return p;
            }),
            bankerIndex: this.bankerIndex,
            phaseIndex: this.phaseIndex,
            minimumbank: this.minimumbank,
            bank: this.bank,
            coins: this.coins,
            warning: this.warning,
            deck: this.deck.length,
            winners: this.winners,
            losers: this.losers,
            spectator: user && this.findPlayer(user.sid) === -1 ? true : false,
        };
    }

    // misc.

    playerCnt() {
        let cnt = 0;
        this.players.forEach((p) =>
            typeof p !== "undefined" && p.isActive ? cnt++ : (cnt += 0)
        );
        return cnt;
    }

    seatedPlayers() {
        let cnt = 0;
        this.players.forEach((p) =>
            typeof p !== "undefined" ? cnt++ : (cnt += 0)
        );
        return cnt;
    }

    getUserList(socket) {
        let sids = [];
        this.players.forEach((p) => (p ? sids.push(p.sid) : undefined));
        Logger.respLog("resp_ingame_userlist", sids, "success");
        socket.emit("resp_ingame_userlist", sids);
    }

    findPlayer(sid) {
        for (let i = 0; i < this.players.length; i++)
            if (this.players[i] && sid === this.players[i].sid) return i;
        return -1;
    }

    shuffle() {
        for (let i = 0; i < 1000; i++) {
            let s1 = Math.floor(Math.random() * 52);
            let s2 = Math.floor(Math.random() * 52);
            let temp = this.deck[s1];
            this.deck[s1] = this.deck[s2];
            this.deck[s2] = temp;
        }
    }

    resetPlayers() {
        this.players.forEach((player) => {
            if (typeof player !== "undefined") {
                player.lastAction = undefined;
                player.confirm = false;
            }
        });
    }
}

module.exports = Room;
