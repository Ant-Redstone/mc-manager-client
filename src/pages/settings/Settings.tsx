import { useState } from 'react'
import { Map as MapIcon } from 'lucide-react'
import { getBlueMapUrl, setBlueMapUrl } from '../../lib/settings'
import { useToast } from '../../components/toast/ToastContext'
import './Settings.css'

function Settings() {
  const { toast } = useToast()
  const [bluemap, setBluemap] = useState(getBlueMapUrl)

  const save = (e: React.FormEvent) => {
    e.preventDefault()
    const value = bluemap.trim()
    if (value && !/^https?:\/\//i.test(value)) {
      toast('Enter a full URL starting with http:// or https://', 'error')
      return
    }
    setBlueMapUrl(value)
    setBluemap(value)
    toast(value ? 'BlueMap URL saved' : 'BlueMap URL cleared', 'success')
  }

  return (
    <div className="settings-page">
      <h2>Settings</h2>
      <p className="settings-note">These preferences are saved in this browser.</p>

      <form className="settings-form" onSubmit={save}>
        <div className="setting">
          <label htmlFor="bluemap">
            <MapIcon size={16} /> BlueMap URL
          </label>
          <p className="setting-help">
            The address of your BlueMap live map. Powers the “View on live map” button in a player's
            panel. Leave it empty to hide the button.
          </p>
          <div className="setting-row">
            <input
              id="bluemap"
              type="url"
              inputMode="url"
              placeholder="https://map.yourserver.com"
              value={bluemap}
              onChange={(e) => setBluemap(e.target.value)}
            />
            <button type="submit" className="btn-save">
              Save
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}

export default Settings
