import { Sun, Moon, CalendarX2, UserX, Package } from 'lucide-react'

export default function RatesPolicies() {
  return (
    <section id="rates" className="mb-12">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 text-center">Rates & Policies</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column - Rate Cards */}
          <div className="space-y-4">
            {/* Daytime Rate Card */}
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-5 text-white">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white/20 rounded-xl">
                    <Sun className="w-8 h-8" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">Daytime Rate</h3>
                    <p className="text-white/80 text-sm">(7:00 AM - 6:00 PM)</p>
                    <div className="mt-2">
                      <span className="text-sm">Php</span>
                      <span className="text-4xl font-bold ml-1">200</span>
                      <span className="text-lg">/hr</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Evening Rate Card */}
            <div className="rounded-2xl overflow-hidden shadow-lg">
              <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-5 text-white">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-white/20 rounded-xl">
                    <Moon className="w-8 h-8" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold">Evening Rate</h3>
                    <p className="text-white/80 text-sm">(6:00 PM - 9:00 PM)</p>
                    <div className="mt-2">
                      <span className="text-sm">Php</span>
                      <span className="text-4xl font-bold ml-1">250</span>
                      <span className="text-lg">/hr</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Promo Banner */}
            <div className="rounded-xl bg-amber-400 px-5 py-4 flex items-center justify-center gap-3 shadow-sm">
              <div className="bg-amber-500 rounded-full px-2.5 py-1">
                <span className="text-white text-xs font-bold">FREE</span>
              </div>
              <span className="text-emerald-900 font-semibold text-sm">
                FREE use of paddles & balls (promo!)
              </span>
            </div>
          </div>

          {/* Right Column - Policy Cards */}
          <div className="space-y-4">
            {/* Cancellation Policy Card */}
            <div className="rounded-xl border-2 border-emerald-500 bg-white p-5 shadow-sm">
              <div className="flex flex-col items-center text-center">
                <div className="p-3 bg-emerald-50 rounded-full mb-3">
                  <CalendarX2 className="w-8 h-8 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-3">Cancellation Policy</h3>
                <ul className="text-gray-700 space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="font-semibold text-emerald-600">Free</span>
                    <span className="text-gray-500">—</span>
                    <span>Cancel 24 hours before booking</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="font-semibold text-amber-600">P100/hour</span>
                    <span className="text-gray-500">—</span>
                    <span>Cancellation within 24 hours</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Bottom Row - Two Cards */}
            <div className="grid grid-cols-2 gap-4">
              {/* No-Show Policy Card */}
              <div className="rounded-xl border-2 border-emerald-500 bg-white p-4 shadow-sm">
                <div className="flex flex-col items-center text-center">
                  <div className="p-3 bg-emerald-50 rounded-full mb-3">
                    <UserX className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">No-Show Policy</h3>
                  <p className="text-gray-600 text-sm">Full fee will be charged</p>
                </div>
              </div>

              {/* Other Equipment Card */}
              <div className="rounded-xl border-2 border-emerald-500 bg-white p-4 shadow-sm">
                <div className="flex flex-col items-center text-center">
                  <div className="p-3 bg-emerald-50 rounded-full mb-3">
                    <Package className="w-6 h-6 text-emerald-600" />
                  </div>
                  <h3 className="text-base font-bold text-gray-900 mb-1">Other Equipment</h3>
                  <p className="text-gray-600 text-sm">Charged separately upon request</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center mt-6">
          Prices and policies are subject to change. For group bookings or special requests, please contact us.
        </p>
      </div>
    </section>
  )
}
