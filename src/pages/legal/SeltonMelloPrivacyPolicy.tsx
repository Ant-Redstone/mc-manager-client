import { Link } from 'react-router-dom'
import './Legal.css'

function SeltonMelloPrivacyPolicy() {
  return (
    <div className="legal-page">
      <div className="legal-card">
        <h1>Selton Mello — Privacy Policy</h1>
        <p className="legal-updated">Last updated: July 2026</p>

        <p>
          This page describes what data the <strong>Selton Mello</strong> Discord bot ("the bot")
          collects and how it's used. The bot is a personal, self-hosted project that bridges chat
          between a Discord server and a Minecraft server managed by mc-manager. It is not a
          commercial product, and no data is ever sold or shared with advertisers.
        </p>

        <h2>What data is collected</h2>
        <ul>
          <li>
            <strong>Server configuration:</strong> when an admin runs <code>/setbotchannel</code>,
            the bot stores the Discord server ID and the chosen channel ID (and, separately, the ID
            of a status message it maintains) in a local database. No message content is stored
            here — only these IDs.
          </li>
          <li>
            <strong>Relayed chat messages:</strong> messages sent in the configured channel are
            read and forwarded to the Minecraft server's chat in real time, and Minecraft chat is
            forwarded back into that Discord channel. This includes the message text and, for
            Discord messages, the sender's display name and role color (used only to format the
            message shown in-game). This content is relayed live and is not stored in the bot's
            database.
          </li>
          <li>
            <strong>Operational logs:</strong> the host running the bot keeps standard process
            logs (e.g. command usage, connection status) for a limited time for debugging. These
            logs may incidentally include message text, usernames, or IDs involved in a relay or
            command at the time it happened.
          </li>
        </ul>

        <h2>What is not collected</h2>
        <ul>
          <li>No cookies, analytics, or tracking of any kind.</li>
          <li>No data is sold, rented, or shared with advertisers or unrelated third parties.</li>
          <li>No message history is stored or searchable beyond live relaying and short-lived operational logs.</li>
        </ul>

        <h2>Third parties involved</h2>
        <p>
          The bot necessarily communicates with <strong>Discord</strong> (to send/receive messages
          and slash commands — subject to{' '}
          <a href="https://discord.com/privacy" target="_blank" rel="noreferrer">
            Discord's own Privacy Policy
          </a>
          ) and with the <strong>mc-manager-server</strong> instance it's paired with (the same
          operator's self-hosted Minecraft server backend, used to relay chat and commands). No
          other third-party services receive this data.
        </p>

        <h2>Data retention & deletion</h2>
        <p>
          Server configuration (channel ID, status message ID) is kept until it's changed or the
          bot is removed from your server — removal does not automatically purge this record today.
          If you'd like your server's configuration data deleted at any time, contact the bot owner
          (below) and it will be removed promptly.
        </p>

        <h2>Contact</h2>
        <p>
          Questions or data deletion requests: email{' '}
          <a href="mailto:lomokwa.dev@gmail.com">lomokwa.dev@gmail.com</a>, or reach out to the bot
          owner directly on Discord @ <b>lomokwa</b>.
        </p>

        <div className="legal-crosslink">
          See also the <Link to="/legal/selton-mello-bot/terms">Terms of Service</Link>.
        </div>
      </div>
    </div>
  )
}

export default SeltonMelloPrivacyPolicy
