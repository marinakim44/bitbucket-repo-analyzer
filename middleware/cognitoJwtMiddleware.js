// cognitoJwtMiddleware.js
import jwksClient from "jwks-rsa";
import jwt from "jsonwebtoken";

const REGION = "";
const USER_POOL = "";
const ISSUER = `https://cognito-idp.${REGION}.amazonaws.com/${USER_POOL}`;

const client = jwksClient({
  jwksUri: `${ISSUER}/.well-known/jwks.json`,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

export function requireCognitoAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "Missing Authorization header" });
  }

  jwt.verify(
    token,
    getKey,
    {
      issuer: ISSUER,
      algorithms: ["RS256"],
    },
    (err, decoded) => {
      if (err) {
        console.error("JWT verification failed:", err);
        return res.status(401).json({ error: "Invalid token" });
      }
      next();
    },
  );
}
