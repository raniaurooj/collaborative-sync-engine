import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.JWT_SECRET
const TOKEN_EXPIRY = process.env.TOKEN_EXPIRY

export function issueGuestToken(){
    const userId = "guest-"+ Math.random().toString(36).slice(2,10)
    const name = "Guest-" + Math.floor(Math.random()*1000)

    const token = jwt.sign({userId,name},JWT_SECRET,{
        expiresIn: TOKEN_EXPIRY
    })

    return {token, userId, name}
}

export function verifyToken(token){
    try {
       return  jwt.verify(token, JWT_SECRET)
    } catch (error) {
        return null;
    }
}
