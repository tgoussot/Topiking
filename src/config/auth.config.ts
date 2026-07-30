import "dotenv/config"

const secret = process.env.JWT_SECRET;
if (!secret){
    throw new Error("La variable JWT_SECRET n'est pas définis")
}

export const JWT_SECRET = secret;
export const JWT_EXPIRY = "15m"
export const JWT_EXPIRY_PARTICIPANT = "4h"
