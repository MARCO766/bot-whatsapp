export default function FlowChatUltraPro() {
  return (
    <div className="h-screen w-full bg-[#071018] text-white flex overflow-hidden">
      {/* SIDEBAR */}
      <div className="w-[340px] bg-[#0b1722] border-r border-white/5 flex flex-col">
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-lime-400">MacBot</h1>
            <p className="text-xs text-gray-400 mt-1">Inbox tiempo real</p>
          </div>

          <div className="w-3 h-3 rounded-full bg-lime-400 animate-pulse" />
        </div>

        <div className="p-4">
          <input
            placeholder="Buscar chats..."
            className="w-full bg-[#132331] border border-white/5 rounded-2xl px-4 py-3 outline-none"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-5 space-y-2">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="bg-[#111f2b] hover:bg-[#162938] transition rounded-2xl p-4 cursor-pointer border border-transparent hover:border-lime-400/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex gap-3 flex-1 min-w-0">
                  <div className="w-14 h-14 rounded-full bg-lime-400/20 flex items-center justify-center text-lime-400 font-bold text-lg">
                    M
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold truncate">59176187797</h3>

                      <span className="text-[11px] text-gray-400 whitespace-nowrap">
                        11:35
                      </span>
                    </div>

                    <p className="text-sm text-gray-400 truncate mt-1">
                      📄 Documento enviado
                    </p>
                  </div>
                </div>

                <div className="bg-lime-400 text-black text-xs font-bold min-w-[24px] h-6 rounded-full flex items-center justify-center px-2">
                  2
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CHAT */}
      <div className="flex-1 flex flex-col relative bg-[#071018]">
        {/* TOP */}
        <div className="h-[80px] border-b border-white/5 bg-[#0c1824]/90 backdrop-blur flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-lime-400/20 flex items-center justify-center text-lime-400 font-bold text-lg">
              M
            </div>

            <div>
              <h2 className="font-bold text-lg">59176187797</h2>
              <p className="text-sm text-lime-400">En línea</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="bg-[#152635] hover:bg-[#1b3348] transition px-4 py-2 rounded-xl text-sm">
              Etiquetas
            </button>

            <button className="bg-[#152635] hover:bg-[#1b3348] transition px-4 py-2 rounded-xl text-sm">
              Bloquear
            </button>
          </div>
        </div>

        {/* MENSAJES */}
        <div className="flex-1 overflow-y-auto px-8 py-8 space-y-6">
          {/* ENTRANTE */}
          <div className="flex items-end gap-3">
            <div className="max-w-[420px] bg-[#132331] rounded-[24px] rounded-bl-md px-5 py-4 shadow-lg border border-white/5">
              <p className="text-[15px] leading-relaxed">
                Hola quiero información del curso.
              </p>

              <div className="flex justify-end mt-2">
                <span className="text-[11px] text-gray-400">11:33 am</span>
              </div>
            </div>
          </div>

          {/* IMAGEN */}
          <div className="flex justify-end">
            <div className="max-w-[380px] bg-[#0f5132] rounded-[24px] rounded-br-md p-3 shadow-lg">
              <img
                src="https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop"
                className="rounded-2xl w-full object-cover"
              />

              <p className="mt-3 text-sm">Aquí está el QR</p>

              <div className="flex justify-end mt-2">
                <span className="text-[11px] text-gray-300">11:34 am</span>
              </div>
            </div>
          </div>

          {/* VIDEO */}
          <div className="flex justify-end">
            <div className="max-w-[380px] bg-[#0f5132] rounded-[24px] rounded-br-md p-3 shadow-lg">
              <video
                controls
                className="rounded-2xl w-full"
              >
                <source src="https://www.w3schools.com/html/mov_bbb.mp4" />
              </video>

              <div className="flex justify-end mt-2">
                <span className="text-[11px] text-gray-300">11:35 am</span>
              </div>
            </div>
          </div>

          {/* DOCUMENTO */}
          <div className="flex items-end gap-3">
            <div className="max-w-[350px] bg-[#132331] rounded-[24px] rounded-bl-md p-4 border border-white/5">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center text-2xl">
                  📄
                </div>

                <div className="flex-1">
                  <h3 className="font-semibold">catalogo.pdf</h3>
                  <p className="text-sm text-gray-400">2.3 MB</p>
                </div>

                <button className="bg-lime-400 text-black px-4 py-2 rounded-xl text-sm font-semibold">
                  Abrir
                </button>
              </div>
            </div>
          </div>

          {/* AUDIO */}
          <div className="flex justify-end">
            <div className="max-w-[320px] bg-[#0f5132] rounded-[24px] rounded-br-md p-4 shadow-lg">
              <div className="flex items-center gap-4">
                <button className="w-12 h-12 rounded-full bg-lime-400 text-black font-bold text-lg">
                  ▶
                </button>

                <div className="flex-1">
                  <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
                    <div className="h-full w-[40%] bg-lime-400 rounded-full" />
                  </div>

                  <div className="flex justify-between text-xs text-gray-300 mt-2">
                    <span>0:12</span>
                    <span>0:30</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="border-t border-white/5 bg-[#0b1722] p-5">
          <div className="flex items-end gap-4">
            {/* BOTON + */}
            <button className="w-14 h-14 rounded-2xl bg-[#162635] hover:bg-[#1d3449] transition text-3xl text-lime-400 flex items-center justify-center shrink-0">
              +
            </button>

            {/* INPUT */}
            <div className="flex-1 bg-[#132331] rounded-3xl px-5 py-4 border border-white/5">
              <textarea
                placeholder="Escribe un mensaje..."
                className="w-full bg-transparent outline-none resize-none text-white placeholder:text-gray-500 min-h-[24px] max-h-[140px]"
              />

              {/* PROGRESO ARCHIVO */}
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-400 mb-2">
                  <span>video.mp4</span>
                  <span>78%</span>
                </div>

                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full w-[78%] bg-lime-400 rounded-full transition-all duration-300" />
                </div>
              </div>
            </div>

            {/* ENVIAR */}
            <button className="w-16 h-16 rounded-2xl bg-lime-400 hover:scale-105 transition text-black text-2xl font-bold shadow-2xl shadow-lime-400/30 shrink-0">
              ➤
            </button>
          </div>

          {/* MENU MULTIMEDIA */}
          <div className="mt-4 flex flex-wrap gap-3">
            <button className="bg-[#132331] hover:bg-[#1b3348] transition px-4 py-2 rounded-xl text-sm">
              🖼 Imagen
            </button>

            <button className="bg-[#132331] hover:bg-[#1b3348] transition px-4 py-2 rounded-xl text-sm">
              🎥 Video
            </button>

            <button className="bg-[#132331] hover:bg-[#1b3348] transition px-4 py-2 rounded-xl text-sm">
              🎵 Audio
            </button>

            <button className="bg-[#132331] hover:bg-[#1b3348] transition px-4 py-2 rounded-xl text-sm">
              📄 PDF
            </button>

            <button className="bg-[#132331] hover:bg-[#1b3348] transition px-4 py-2 rounded-xl text-sm">
              📊 Excel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
