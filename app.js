const express = require('express')
const path = require('path')
const app = express()

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
app.use(express.json())
let db = null

const initDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () => {
      console.log('Server is running at http://localhost:3000/')
    })
  } catch (e) {
    console.log(e.message)
    process.exit(1)
  }
}
initDbAndServer()


//api1
app.post('/login', async (request, response) => {
  const loginDetails = request.body
  const {username, password} = loginDetails
  const isInQuery = `
  SELECT * FROM user
  WHERE username = '${username}'
  ;`
  const dbInUser = await db.get(isInQuery)
  //console.log(dbUser)
  if (dbInUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const isPasswordEqual = await bcrypt.compare(password, dbInUser.password)
    if (isPasswordEqual) {
      const payload = {username}
      const jwtToken = jwt.sign(payload, 'secret_token')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})


const authenticateToken = (request, response, next) => {
  let awtToken
  const authHeader = request.headers['authorization']
  if (authHeader !== undefined) {
    awtToken = authHeader.split(' ')[1]
  }
  if (awtToken === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(awtToken, 'secret_token', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//api2
app.get('/states/', authenticateToken, async (request, response) => {
  console.log(request.username)
  const getStatesQuery = `
        SELECT * 
        FROM state
    ;`
  let states = await db.all(getStatesQuery)
  const format = states => {
    return {
      stateId: states.state_id,
      stateName: states.state_name,
      population: states.population,
    }
  }
  response.send(states.map(eachState => format(eachState)))
})

//api3
app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getRequiredStateQuery = `
        SELECT * 
        FROM state
        WHERE state_id = ${stateId}
    ;`
  let state = await db.get(getRequiredStateQuery)

  response.send({
    stateId: state.state_id,
    stateName: state.state_name,
    population: state.population,
  })
})

//api4
app.post('/districts/', authenticateToken, async (request, response) => {
  const districtInfo = request.body
  const {districtName, stateId, cases, cured, active, deaths} = districtInfo
  const insertDistrictQuery = `
        INSERT INTO district
        (district_name,state_id,cases,cured,active,deaths)
        VALUES('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths});
    ;`
  await db.run(insertDistrictQuery)
  response.send('District Successfully Added')
})

//api5
app.get('/districts/:districtId/', authenticateToken, async (request, response) => {
    console.log(request.username)
    const {districtId} = request.params
    const getRequiredDistrictQuery = `
        SELECT * 
        FROM district
        WHERE district_id = ${districtId}
    ;`
    let district = await db.get(getRequiredDistrictQuery)

    response.send({
      districtId: district.district_id,
      districtName: district.district_name,
      stateId: district.state_id,
      cases: district.cases,
      cured: district.cured,
      active: district.active,
      deaths: district.deaths,
    })
  },
)

//api6
app.delete('/districts/:districtId/', authenticateToken, async (request, response) => {
    const {districtId} = request.params
    const deleteRequiredDistrictQuery = `
        DELETE
        FROM district
        WHERE district_id = ${districtId}
    ;`
    await db.run(deleteRequiredDistrictQuery)

    response.send('District Removed')
  },
)

//api7
app.put('/districts/:districtId/', authenticateToken, async (request, response) => {
    console.log(request.username)
    const {districtId} = request.params
    const districtInfo = request.body
    const {districtName, stateId, cases, cured, active, deaths} = districtInfo
    const getRequiredDistrictQuery = `
        UPDATE district 
        SET 
        district_name = '${districtName}',
        state_id = ${stateId},
        cases = ${cases},
        cured = ${cured},
        active = ${active},
        deaths = ${deaths}
        WHERE district_id = ${districtId}
    ;`
    await db.run(getRequiredDistrictQuery)

    response.send('District Details Updated')
  },
)

//api8
app.get('/states/:stateId/stats/', authenticateToken, async (request, response) => {
    const {stateId} = request.params
    const getRequiredStateQuery = `
      select 
      sum(cases) as totalCases,
      sum(cured) as totalCured,
      sum(active) as totalActive,
      sum(deaths) as totalDeaths
      from district 
      group by state_id 
      having state_id = ${stateId}
    ;`
    let stats = await db.get(getRequiredStateQuery)
    response.send(stats)
  },
)


//api0.1
app.post('/register', async (request, response) => {
  const userInfo = request.body
  const {username, name, password, gender, location} = userInfo
  const userQuery = `
  SELECT * FROM user
  WHERE username = '${username}'
  ;`
  const dbUser = await db.get(userQuery)
  //console.log(dbUser)
  if (dbUser === undefined) {
    if (password.length < 5) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const insertUserQuery = `
      INSERT INTO user
      VALUES(
        '${username}',
        '${name}',
        '${hashedPassword}',
        '${gender}',
        '${location}'
      )
      ;`
      await db.run(insertUserQuery)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})
//api0.2
app.put('/change-password', async (request, response) => {
  const newPasswordDetails = request.body
  const {username, oldPassword, newPassword} = newPasswordDetails
  const userCheckQuery = `
  SELECT * FROM user
  WHERE username = '${username}'
  ;`
  const dbUser = await db.get(userCheckQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid User')
  } else {
    const isPasswordEqual = await bcrypt.compare(oldPassword, dbUser.password)
    if (isPasswordEqual) {
      if (newPassword.length < 5) {
        response.status(400)
        response.send('Password is too short')
      } else {
        const hashedPassword = await bcrypt.hash(newPassword, 10)
        const passwordUpdateQuery = `
              UPDATE user
              SET password = "${hashedPassword}"
              WHERE username = "${username}"
            ;`
        await db.run(passwordUpdateQuery)
        response.status(200)
        response.send('Password updated')
      }
    } else {
      response.status(400)
      response.send('Invalid current password')
    }
  }
})

//api0.3
app.get('/users/', async (request, response) => {
  const getUsersQuery = `SELECT * FROM user;`
  const users = await db.all(getUsersQuery)
  response.send(users)
})

module.exports = app
