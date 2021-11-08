const LightningClient = require( './lightning-client')
const uuid = require('uuid')
const client = new LightningClient('/home/taylor/.lightning/bitcoin', true);
const myId = '0337694505123a12a8fadd95523dcc235898ad3b80a06e4a63ca26fed68dd0d17c'

let fullChannels = []
let fullPeers = []
// let emptyChannels = []
// let emptyPeers = []
let amountMsat = 91111000
// let tryOnce = false

// getroute config
let cltv = 34
let riskfactor = 33
let fuzzpercent = 50

client.listpeers().then(x => {
    x.peers.forEach(p => {
        let channel = p.channels[0]
        if (channel && channel.short_channel_id){
            if (channel.msatoshi_to_us / channel.msatoshi_total > 0.95){
              fullPeers.push(p.id)
              fullChannels.push(channel.short_channel_id.concat('/').concat(channel.direction ? 0 : 1))
            } else if (channel.msatoshi_to_us / channel.msatoshi_total > .333){
              fullChannels.push(channel.short_channel_id.concat('/').concat(channel.direction ? 0 : 1))
            }
            // if (p.channels[0].msatoshi_to_us / p.channels[0].msatoshi_total < 0.13){
            //   emptyPeers.push(p.id)
            //   emptyChannels.push(channel.short_channel_id.concat('/').concat(channel.direction ? 0 : 1))
            // }
        }
    })

    console.log('got ', fullPeers.length, fullChannels.length, 'full')

    fullPeers.forEach((fp, i) => {
        // fullChannels.push('566626x367x0/0', '026165850492521f4ac8abd9bd8088123446d126f648ca35e60f88177dc149ceb2',
        // '03d1b18df3cefb5f530ab230b365e984118a06de282d984e17930f16fabfb8c009', '025f1456582e70c4c06b61d5c8ed3ce229e6d0db538be337a2dc6d163b0ebc05a5')
        client.getroute(myId, amountMsat, riskfactor, cltv, fp, fuzzpercent, fullChannels).then(r => {
            let secondhop = r.route[0]
            let initialhop
            client.listpeers(fp).then( x => {

                let shortId = x.peers[0].channels[0].short_channel_id

                client.listchannels(shortId).then(c => {
                    let addedFee
                    let addedDelay

                    c.channels.forEach(channelInfo => {
                        if (channelInfo.source === myId && channelInfo.destination === fp){
                            // is this 1000X + 1000 too high than logical but still getting WIRE_FEE_INSUFFICIENT
                            let additionalFee = parseInt(channelInfo.base_fee_millisatoshi + channelInfo.fee_per_millionth * amountMsat / 1000000) + 1000
                            addedFee = parseInt(secondhop.msatoshi + additionalFee)
                            // failing with WIRE_INCORRECT_CLTV_EXPIRY too (+9?)
                            addedDelay = secondhop.delay + channelInfo.delay + 9
                        }
                    })

                    initialhop = {
                      id: fp,
                      channel: shortId,
                      direction: x.peers[0].channels[0].direction ? 0 : 1, // swap direction so out
                      msatoshi: addedFee,
                      amount_msat: ''.concat(addedFee).concat('msat'), //
                      delay: addedDelay,
                      style: 'tlv'
                    }

                    let fullRoute = [initialhop].concat(r.route)
                    if (addedFee - amountMsat < 75000 ){
                        // tryOnce = true
                        console.log('trying route of with Fee of ', addedFee - amountMsat, initialhop.channel, ' -> ' ,fullRoute[fullRoute.length-1].channel)
                        let label = uuid.v1()
                        // failing
                        client.invoice(amountMsat, label, 'circularRebalance', null, null, null, null, 50 ).then( invoice => {
                            client.sendpay(fullRoute, invoice.payment_hash, label, null , null , invoice.payment_secret)
                                .then(x => {})
                                .catch(console.log)
                        }).catch(console.log)
                    }
                }).catch(console.log)
            }).catch(console.log)
        }).catch(console.log)
    })
}).catch(console.log)
