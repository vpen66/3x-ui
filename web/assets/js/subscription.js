(function () {
  // Vue app for Subscription page
  const el = document.getElementById('subscription-data');
  if (!el) return;
  const textarea = document.getElementById('subscription-links');
  const rawLinks = (textarea?.value || '').split('\n').filter(Boolean);

  const data = {
    sId: el.getAttribute('data-sid') || '',
    subUrl: el.getAttribute('data-sub-url') || '',
    subJsonUrl: el.getAttribute('data-subjson-url') || '',
    subClashUrl: el.getAttribute('data-subclash-url') || '',
    download: el.getAttribute('data-download') || '',
    upload: el.getAttribute('data-upload') || '',
    used: el.getAttribute('data-used') || '',
    total: el.getAttribute('data-total') || '',
    remained: el.getAttribute('data-remained') || '',
    expireMs: (parseInt(el.getAttribute('data-expire') || '0', 10) || 0) * 1000,
    lastOnlineMs: (parseInt(el.getAttribute('data-lastonline') || '0', 10) || 0),
    downloadByte: parseInt(el.getAttribute('data-downloadbyte') || '0', 10) || 0,
    uploadByte: parseInt(el.getAttribute('data-uploadbyte') || '0', 10) || 0,
    totalByte: parseInt(el.getAttribute('data-totalbyte') || '0', 10) || 0,
    datepicker: el.getAttribute('data-datepicker') || 'gregorian',
  };

  // Normalize lastOnline to milliseconds if it looks like seconds
  if (data.lastOnlineMs && data.lastOnlineMs < 10_000_000_000) {
    data.lastOnlineMs *= 1000;
  }

  function renderLink(item) {
    return (
      Vue.h('a-list-item', {}, [
        Vue.h('a-space', { props: { size: 'small' } }, [
          Vue.h('a-button', { props: { size: 'small' }, on: { click: () => copy(item) } }, [Vue.h('a-icon', { props: { type: 'copy' } })]),
          Vue.h('span', { class: 'break-all' }, item)
        ])
      ])
    );
  }

  function copy(text) {
    ClipboardManager.copyText(text).then(ok => {
      const messageType = ok ? 'success' : 'error';
      Vue.prototype.$message[messageType](ok ? 'Copied' : 'Copy failed');
    });
  }

  function open(url) {
    window.location.href = url;
  }

  function drawQR(value) {
    try {
      new QRious({ element: document.getElementById('qrcode'), value, size: 220 });
    } catch (e) {
      console.warn(e);
    }
  }

  // Try to extract a human label (email/ps) from different link types
  function linkName(link, idx) {
    try {
      if (link.startsWith('vmess://')) {
        const json = JSON.parse(atob(link.replace('vmess://', '')));
        if (json.ps) return json.ps;
        if (json.add && json.id) return json.add; // fallback host
      } else if (link.startsWith('vless://') || link.startsWith('trojan://')) {
        const hashIdx = link.indexOf('#');
        if (hashIdx !== -1) return decodeURIComponent(link.substring(hashIdx + 1));
        const qIdx = link.indexOf('?');
        if (qIdx !== -1) {
          const qs = new URL('http://x/?' + link.substring(qIdx + 1, hashIdx !== -1 ? hashIdx : undefined)).searchParams;
          if (qs.get('remark')) return qs.get('remark');
          if (qs.get('email')) return qs.get('email');
        }
        const at = link.indexOf('@');
        const protSep = link.indexOf('://');
        if (at !== -1 && protSep !== -1) return link.substring(protSep + 3, at);
      } else if (link.startsWith('ss://')) {
        const hashIdx = link.indexOf('#');
        if (hashIdx !== -1) return decodeURIComponent(link.substring(hashIdx + 1));
      }
    } catch (e) { /* ignore and fallback */ }
    return 'Link ' + (idx + 1);
  }

  const app = new Vue({
    delimiters: ['[[', ']]'],
    el: '#app',
    data: {
      themeSwitcher,
      app: data,
      links: rawLinks,
      lang: '',
      viewportWidth: (typeof window !== 'undefined' ? window.innerWidth : 1024),
      serverStatus: null,
      hostVariant: 'default',
    },
    async mounted() {
      this.lang = LanguageManager.getLanguage();
      const tpl = document.getElementById('subscription-data');
      const sj = tpl ? tpl.getAttribute('data-subjson-url') : '';
      const sc = tpl ? tpl.getAttribute('data-subclash-url') : '';
      if (sj) this.app.subJsonUrl = sj;
      if (sc) this.app.subClashUrl = sc;
      await this.getStatus();
      this.redrawQRCodes();
      drawQR(this.variantSubUrl);
      try {
        const elJson = document.getElementById('qrcode-subjson');
        if (elJson && this.variantSubJsonUrl) {
          new QRious({ element: elJson, value: this.variantSubJsonUrl, size: 220 });
        }
        const elClash = document.getElementById('qrcode-subclash');
        if (elClash && this.variantSubClashUrl) {
          new QRious({ element: elClash, value: this.variantSubClashUrl, size: 220 });
        }
      } catch (e) { /* ignore */ }
      this._onResize = () => { this.viewportWidth = window.innerWidth; };
      window.addEventListener('resize', this._onResize);
    },
    beforeDestroy() {
      if (this._onResize) window.removeEventListener('resize', this._onResize);
    },
    computed: {
      isMobile() {
        return this.viewportWidth < 576;
      },
      isUnlimited() {
        return !this.app.totalByte;
      },
      isActive() {
        const now = Date.now();
        const expiryOk = !this.app.expireMs || this.app.expireMs >= now;
        const trafficOk = !this.app.totalByte || (this.app.uploadByte + this.app.downloadByte) <= this.app.totalByte;
        return expiryOk && trafficOk;
      },
      availableVariants() {
        const variants = [{ key: 'default', label: '默认' }];
        const publicIP = this.serverStatus && this.serverStatus.publicIP ? this.serverStatus.publicIP : null;
        if (publicIP && publicIP.ipv4 && publicIP.ipv4 !== 'N/A') {
          variants.push({ key: 'ipv4', label: 'IPv4' });
        }
        if (publicIP && publicIP.ipv6 && publicIP.ipv6 !== 'N/A') {
          variants.push({ key: 'ipv6', label: 'IPv6' });
        }
        return variants;
      },
      variantSubUrl() {
        return this.getDisplayLink(this.app.subUrl);
      },
      variantSubJsonUrl() {
        return this.getDisplayLink(this.app.subJsonUrl);
      },
      variantSubClashUrl() {
        return this.getDisplayLink(this.app.subClashUrl);
      },
      shadowrocketUrl() {
        const rawUrl = this.variantSubUrl + '?flag=shadowrocket';
        const base64Url = btoa(rawUrl);
        const remark = encodeURIComponent(this.app.sId || 'Subscription');
        return `shadowrocket://add/sub/${base64Url}?remark=${remark}`;
      },
      v2boxUrl() {
        return `v2box://install-sub?url=${encodeURIComponent(this.variantSubUrl)}&name=${encodeURIComponent(this.app.sId)}`;
      },
      streisandUrl() {
        return `streisand://import/${encodeURIComponent(this.variantSubUrl)}`;
      },
      v2raytunUrl() {
        return this.variantSubUrl;
      },
      npvtunUrl() {
        return this.variantSubUrl;
      },
      happUrl() {
        return `happ://add/${this.variantSubUrl}`;
      }
    },
    methods: {
      renderLink,
      copy,
      open,
      linkName,
      async getStatus() {
        try {
          const msg = await HttpUtil.get('/panel/api/server/status');
          if (msg.success) {
            this.serverStatus = msg.obj;
          }
        } catch (e) {
          console.error('Failed to get server status:', e);
        }
      },
      setHostVariant(variant) {
        this.hostVariant = variant;
        this.redrawQRCodes();
      },
      getVariantHost() {
        if (!this.serverStatus || !this.serverStatus.publicIP) {
          return '';
        }
        if (this.hostVariant === 'ipv4') {
          return this.serverStatus.publicIP.ipv4 && this.serverStatus.publicIP.ipv4 !== 'N/A' ? this.serverStatus.publicIP.ipv4 : '';
        }
        if (this.hostVariant === 'ipv6') {
          return this.serverStatus.publicIP.ipv6 && this.serverStatus.publicIP.ipv6 !== 'N/A' ? this.serverStatus.publicIP.ipv6 : '';
        }
        return '';
      },
      getDisplayLink(link) {
        const host = this.getVariantHost();
        return host ? this.replaceURLHost(link, host) : link;
      },
      replaceURLHost(link, host) {
        if (!link) return link;
        try {
          const url = new URL(link);
          url.hostname = host;
          return url.toString();
        } catch (e) {
          return link;
        }
      },
      redrawQRCodes() {
        drawQR(this.variantSubUrl);
        try {
          const elJson = document.getElementById('qrcode-subjson');
          if (elJson && this.variantSubJsonUrl) {
            new QRious({ element: elJson, value: this.variantSubJsonUrl, size: 220 });
          }
          const elClash = document.getElementById('qrcode-subclash');
          if (elClash && this.variantSubClashUrl) {
            new QRious({ element: elClash, value: this.variantSubClashUrl, size: 220 });
          }
        } catch (e) { /* ignore */ }
      },
      i18nLabel(key) {
        return '{{ i18n "' + key + '" }}';
      },
    },
  });
})();
