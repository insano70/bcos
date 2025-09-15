'use client'

import { useState, useRef } from 'react'
import type { StaticImageData } from 'next/image'
import { Dialog, DialogBackdrop, DialogPanel } from '@headlessui/react'
import Image from 'next/image'

interface ModalVideo02Props {
  thumb: StaticImageData
  thumbWidth: number
  thumbHeight: number
  thumbAlt: string
  video: string
  videoWidth: number
  videoHeight: number
}

export default function ModalVideo02({
  thumb,
  thumbWidth,
  thumbHeight,
  thumbAlt,
  video,
  videoWidth,
  videoHeight,
}: ModalVideo02Props) {
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  return (
    <div className="max-w-3xl mx-auto" data-aos="fade-up">
      <div className="relative flex justify-center items-center">

        {/* Video thumbnail */}
        <Image src={thumb} width={thumbWidth} height={thumbHeight} alt={thumbAlt} />
        <button className="absolute group" onClick={() => { setModalOpen(true) }} aria-label="Watch the video">
          <svg className="w-16 h-16 fill-current sm:w-20 sm:h-20 group" viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg">
            <circle className="text-white opacity-80 group-hover:opacity-100 transition duration-150 ease-in-out" cx="44" cy="44" r="44" />
            <path className="text-blue-600" d="M52 44a.999.999 0 00-.427-.82l-10-7A1 1 0 0040 37V51a.999.999 0 001.573.82l10-7A.995.995 0 0052 44V44c0 .001 0 .001 0 0z" />
          </svg>
        </button>
        {/* End: Video thumbnail */}

        <Dialog
          initialFocus={videoRef}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        >

          {/* Modal backdrop */}
          <DialogBackdrop
            transition
            className="fixed inset-0 z-99999 bg-black/70 transition-opacity duration-300 ease-out data-closed:opacity-0"
          />
          {/* End: Modal backdrop */}

          {/* Modal dialog */}
          <div className="fixed inset-0 z-99999 flex px-4 py-6 sm:px-6">
            <div className="mx-auto flex h-full max-w-6xl items-center">
              <DialogPanel
                transition
                className="aspect-video max-h-full w-full overflow-hidden bg-black shadow-2xl duration-300 ease-out data-closed:scale-95 data-closed:opacity-0"
              >
                <video ref={videoRef} width={videoWidth} height={videoHeight} loop controls>
                  <source src={video} type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
              </DialogPanel>
            </div>
          </div>
          {/* End: Modal dialog */}

        </Dialog>

      </div>
    </div>
  )
}