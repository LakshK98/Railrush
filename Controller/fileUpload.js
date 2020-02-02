"use strict"
let files = {}  //will hold multiple files with key as the filename
    , blockSize = 1048676    //blockSize we are using is 1MB 
    , uploadDir = '/../Video Uploads/'
    , {updateCrowdInfo} = require("../model/database")
    , path = require('path')
    , fs = require('fs')
    , {spawn} = require('child_process');

const callScript = (fileName , trainInfo)=>{
    let process = spawn("py" , [path.join(__dirname , "/../CrowdCountModel.py") , path.join(__dirname , "/../Video Uploads/"+fileName)])
    process.stdout.on('data', (data)=>{
        console.log(typeof Number(data))
        saveToDatabase(trainInfo , Number(data))
    })
    process.stderr.on('data' , (data)=>{
        console.log(data.toString())
    })
    process.on('close',(exitCode)=>{
        console.log("Exit : "+exitCode)
    })
}

const saveToDatabase = (trainInfo , crowdCount)=>{
    console.log(typeof trainInfo.trainNo)
    updateCrowdInfo(trainInfo.trainNo , {current:trainInfo.current , crowdCount:crowdCount , timestamp: trainInfo.timestamp})
        .then((result)=>{
            console.log(result.result)
        }).catch((e)=>{
            console.log(e)
        })
}

module.exports = (io)=>{
    //sockets connection--------------------------------------------------------------------------------
    io.on('connection' , (socket) =>{
        
        //Listen to Client Event 1 : Start upload -------------------------------------------------------
        socket.on('start upload' , (data)=>{
            
            console.log('A Client is Connected'+socket.id)

            try{
                let fileStats = fs.statSync(path.join(__dirname,uploadDir+data.name))
                if(fileStats.size == data.size)             //file exists
                    socket.emit('upload done' , {alreadyExisted: true})
                else                                        //resume upload
                    socket.emit('send next block',{start: files[data.name].downloadedSize , end: files[data.name].downloadedSize + blockSize , resume:true})
                
            }catch(e){                                      //new upload
                files[data.name] = {
                    size: data.size,
                    type: data.type,
                    downloadedData: "",
                    downloadedSize: 0,
                    fileDescriptor: null,
                    train:{
                        trainNo: data.train.trainNo,
                        start: data.train.start,
                        dest: data.train.dest,
                        current: data.train.current,
                        timestamp: data.train.timestamp
                    }
                }
                console.log('new upload '+files[data.name].downloadedSize+e)
                fs.open(path.join(__dirname, uploadDir + data.name) , 'a' ,(err,fd) =>{
                    files[data.name].fileDescriptor = fd
                })
                socket.emit('send next block',{start: 0 , end: blockSize , resume:false})
            }
        })

        //Listen to Client Event 2 : a file block--------------------------------------------------------------------
        socket.on('a file block',(data)=>{
            files[data.fileName].downloadedData += data.fileBlock
            files[data.fileName].downloadedSize += data.fileBlock.length
            console.log(data.fileBlock.length+" files[data.fileName].downloadedSize "+files[data.fileName].downloadedSize)
            
            if(files[data.fileName].downloadedSize < files[data.fileName].size)
                socket.emit('send next block',{start: files[data.fileName].downloadedSize , end: files[data.fileName].downloadedSize + blockSize})
            
            if(files[data.fileName].downloadedData.length > 10486760 ){  //buffer reaches 10mb
                writeToFile(files[data.fileName].downloadedData , files[data.fileName].fileDescriptor)
                files[data.fileName].downloadedData = ""
            }
            
            if(files[data.fileName].downloadedSize == files[data.fileName].size){
                writeToFile(files[data.fileName].downloadedData , files[data.fileName].fileDescriptor)
                socket.emit('upload done' , {alreadyExisted: false})
                callScript(data.fileName , files[data.fileName].train)
                files[data.fileName] = null
            }
                
        })

        //listen to client event 3 : close connection------------------------------------------------------
        socket.on('close connection' , (data)=>{
            console.log('A Client is closing Connection'+socket.id)
            socket.disconnect()
        })
    })

    const writeToFile = (fileData , fd) =>{
        fs.writeFile(fd , fileData , 'Binary' ,(err)=>{
            if(err)
                console.log('error in writing file')
        })
    }

}