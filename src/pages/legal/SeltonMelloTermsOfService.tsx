import { Link } from 'react-router-dom'
import './Legal.css'

function SeltonMelloTermsOfService() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <h1>Selton Mello — Terms of Service</h1>
        <p className="legal-updated">Last updated: July 2026</p>

        <p>
          <strong>Selton Mello</strong> ("the bot") is a personal, self-hosted Discord bot that
          relays chat between a Discord server and a Minecraft server, and offers a few utility
          slash commands. By adding the bot to your server or using its commands, you agree to
          these terms.
        </p>

        <h2>The service</h2>
        <ul>
          <li>The bot relays messages between a Discord channel you choose and a Minecraft server's chat.</li>
          <li>It provides slash commands such as <code>/ping</code>, <code>/help</code>, <code>/setbotchannel</code>, and <code>/invite</code>.</li>
          <li>
            It is provided as a hobby project, "as is," with no uptime guarantee. Features may
            change, be added, or be removed at any time without notice.
          </li>
        </ul>

        <h2>Acceptable use</h2>
        <ul>
          <li>You must comply with Discord's own <a href="https://discord.com/terms" target="_blank" rel="noreferrer">Terms of Service</a> and <a href="https://discord.com/guidelines" target="_blank" rel="noreferrer">Community Guidelines</a> when using the bot.</li>
          <li>Don't use the bot to relay spam, abusive content, or content that violates Discord's or the connected Minecraft server's rules.</li>
          <li>Don't attempt to exploit, overload, or interfere with the bot's operation or the Minecraft server it's connected to.</li>
        </ul>

        <h2>No warranty & limitation of liability</h2>
        <p>
          The bot is offered free of charge, without warranty of any kind, express or implied. The
          owner is not liable for any damages, data loss, service interruption, or other issues
          arising from use of the bot, to the fullest extent permitted by law.
        </p>

        <h2>Changes & termination</h2>
        <p>
          The bot owner may modify these terms, change or discontinue the bot's features, or remove
          the bot from any server at their discretion — for example in response to abuse or misuse.
        </p>

        <h2>Contact</h2>
        <p>
          Questions about these terms: email{' '}
          <a href="mailto:lomokwa.dev@gmail.com">lomokwa.dev@gmail.com</a>, or reach out to the bot
          owner directly on Discord @ <b>lomokwa</b>.
        </p>

        <div className="legal-crosslink">
          See also the <Link to="/legal/selton-mello-bot/privacy">Privacy Policy</Link>.
        </div>
      </div>
    </div>
  )
}

export default SeltonMelloTermsOfService
