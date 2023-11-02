import path from "path"
import { fileURLToPath } from "url"

import * as dotenv from "dotenv"
import { isValidPhoneNumber } from "libphonenumber-js"
import { Markup, Scenes, Telegraf, session } from "telegraf"
import { message } from "telegraf/filters"
import { Api, TelegramClient } from "telegram"
import { StringSession } from "telegram/sessions/index.js"

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

const api_id = Number(process.env.API_ID)
const api_hash = process.env.API_HASH
const clentSession = new StringSession("") // You should put your string session here

const client = new TelegramClient(clentSession, api_id, api_hash, {
	connectionRetries: 5,
})

async function startClient(phone, phoneCodeHash, code) {
	const res = await client.invoke(
		new Api.auth.SignIn({
			phoneNumber: phone,
			phoneCode: code,
			phoneCodeHash: phoneCodeHash,
		})
	)

	client.session.processEntities(res)
	console.log(res)
}
async function sendPhoneCode(phone) {
	await sleep(1000)
	await client.connect()
	console.log(phone)
	const { phoneCodeHash, isCodeViaApp } = await client.sendCode(
		{
			apiId: api_id,
			apiHash: api_hash,
		},
		phone
	)
	return phoneCodeHash
}

const bot = new Telegraf(process.env.BOT_TOKEN)

try {
	//SCENE
	bot.use(session())
	//registration scene
	const registration = new Scenes.BaseScene("registration")
	registration.enter((ctx) => {
		ctx.session.myData = {}
		ctx.reply(
			"Введите ваши данные в формате api_id:api_hash:номер телефона"
		)
	})
	registration.on(message("text"), async (ctx) => {
		// const data = ctx.message.text.split(":")
		// const valid = isValidPhoneNumber(data[2], "RU")
		const valid = isValidPhoneNumber(ctx.message.text, "RU")
		if (valid) {
			ctx.session.myData.phone = ctx.message.text

			await ctx.reply("Ожидайте...")
			await sendPhoneCode(ctx.session.myData.phone)
				.then(async (res) => {
					ctx.session.myData.phoneCodeHash = res
					// await ctx.deleteMessage(
					// 	ctx.update.callback_query.message.message_id
					// )
					ctx.scene.enter("confirmCode")
				})
				.catch((err) => {
					ctx.reply("Произошла ошибка")
					console.log(err)
				})
			return ctx.scene.leave()
		} else {
			await ctx.reply(
				"Неверный номер телефона, попробуйте еще раз",
				Markup.inlineKeyboard([
					[Markup.button.callback("Выйти из регистрации", "leave")],
				])
			)
		}
	})
	registration.action("leave", async (ctx) => {
		await ctx.deleteMessage(ctx.update.callback_query.message.message_id)
		await ctx.reply("Вы вышли из регистрации")
		return ctx.scene.leave()
	})
	//registration end

	//confirmCode scene
	const confirmCode = new Scenes.BaseScene("confirmCode")
	confirmCode.enter((ctx) => ctx.reply("Введите код подтверждения"))
	confirmCode.on(message("text"), async (ctx) => {
		await startClient(
			ctx.session.myData.phone,
			ctx.session.myData.phoneCodeHash,
			ctx.message.text
		)
			.then(() => {
				ctx.reply("Вы успешно зарегистрировались")
				client.session.save()
				return ctx.scene.leave()
			})
			.catch(async (err) => {
				console.log(err)
				await ctx.reply(
					"Неверный код подтверждения, попробуйте еще раз",
					Markup.inlineKeyboard([
						[
							Markup.button.callback(
								"Выйти из регистрации",
								"leave"
							),
						],
					])
				)
			})
	})
	confirmCode.action("leave", async (ctx) => {
		await ctx.deleteMessage(ctx.update.callback_query.message.message_id)
		await ctx.reply("Вы вышли из регистрации")
		return ctx.scene.leave()
	})
	//confirmCode end

	const stage = new Scenes.Stage([registration, confirmCode])
	bot.use(stage.middleware())
	//END SCENE

	//COMMAND START
	bot.command("start", (ctx) => {
		ctx.reply(
			`Выберите функцию в меню.`,
			Markup.keyboard([
				["Подключить аккаунт", "Удалить аккаунт"],
				["Настроить автоответ"],
			]).resize()
		)
	})
	//COMMAND END

	//HEARS START
	bot.hears("Подключить аккаунт", (ctx) => {
		ctx.scene.enter("registration")
	})
	bot.hears("Настроить автоответ", async (ctx) => {
		await client.sendMessage("me", { message: "Hello!" })
	})
	//HEARS END

	//ACTION START
	// bot.action("leave", (ctx) => {
	// 	ctx.scene.leave()
	// })
	//ACTION END

	//LAUNCH
	bot.launch().then(console.log("Бот активен!"))
} catch (err) {
	console.error("Произошла ошибка", err)
}
