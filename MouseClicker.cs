using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace MouseClicker
{
    class Program
    {
        [DllImport("user32.dll", CharSet = CharSet.Auto, CallingConvention = CallingConvention.StdCall)]
        public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);

        [DllImport("user32.dll")]
        static extern bool SetCursorPos(int X, int Y);

        [DllImport("user32.dll")]
        static extern bool GetCursorPos(out POINT lpPoint);

        [StructLayout(LayoutKind.Sequential)]
        public struct POINT
        {
            public int X;
            public int Y;
        }

        private const int MOUSEEVENTF_LEFTDOWN = 0x02;
        private const int MOUSEEVENTF_LEFTUP = 0x04;
        private const int MOUSEEVENTF_RIGHTDOWN = 0x08;
        private const int MOUSEEVENTF_RIGHTUP = 0x10;
        private const int MOUSEEVENTF_WHEEL = 0x0800;

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool SetProcessDPIAware();

        static void MoveSmoothly(int targetX, int targetY)
        {
            POINT p;
            if (!GetCursorPos(out p)) return;
            
            int startX = p.X;
            int startY = p.Y;
            
            int steps = 30; // Number of steps for the animation
            int sleepTime = 10; // ms between steps
            
            for (int i = 1; i <= steps; i++)
            {
                double t = (double)i / steps;
                // Ease out sine
                double easeT = Math.Sin(t * Math.PI / 2);
                
                int currentX = (int)(startX + (targetX - startX) * easeT);
                int currentY = (int)(startY + (targetY - startY) * easeT);
                
                SetCursorPos(currentX, currentY);
                Thread.Sleep(sleepTime);
            }
            
            SetCursorPos(targetX, targetY);
        }

        static void Main(string[] args)
        {
            if (Environment.OSVersion.Version.Major >= 6) {
                SetProcessDPIAware();
            }

            if (args.Length < 3) return;
            
            string action = args[0].ToLower();

            if (action == "drag")
            {
                if (args.Length < 5) return;
                int x1, y1, x2, y2;
                if (int.TryParse(args[1], out x1) && int.TryParse(args[2], out y1) && int.TryParse(args[3], out x2) && int.TryParse(args[4], out y2))
                {
                    MoveSmoothly(x1, y1);
                    Thread.Sleep(50);
                    mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                    Thread.Sleep(50);
                    MoveSmoothly(x2, y2);
                    Thread.Sleep(50);
                    mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                }
            }
            else
            {
                int x, y;
                if (int.TryParse(args[1], out x) && int.TryParse(args[2], out y))
                {
                    MoveSmoothly(x, y);
                    Thread.Sleep(50); // Give it a slight moment to settle

                    if (action == "click")
                    {
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        Thread.Sleep(10);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    }
                    else if (action == "doubleclick")
                    {
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        Thread.Sleep(10);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                        Thread.Sleep(50);
                        mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0);
                        Thread.Sleep(10);
                        mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0);
                    }
                    else if (action == "rightclick")
                    {
                        mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0);
                        Thread.Sleep(10);
                        mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0);
                    }
                    else if (action == "scrollup")
                    {
                        float amount = 120f; // 1 notch default
                        float parsedAmount;
                        if (args.Length > 3 && float.TryParse(args[3], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out parsedAmount)) 
                        {
                            amount = parsedAmount * 120f;
                        }
                        
                        // Smoothly scroll
                        int totalAmount = (int)amount;
                        int step = 15; // smaller steps for smoothness
                        for(int i = 0; i < totalAmount; i += step) {
                            mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)Math.Min(step, totalAmount - i), 0);
                            Thread.Sleep(10);
                        }
                    }
                    else if (action == "scrolldown")
                    {
                        float amount = 120f; 
                        float parsedAmount;
                        if (args.Length > 3 && float.TryParse(args[3], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out parsedAmount)) 
                        {
                            amount = parsedAmount * 120f;
                        }
                        
                        // Smoothly scroll down
                        int totalAmount = (int)amount;
                        int step = 15;
                        for(int i = 0; i < totalAmount; i += step) {
                            mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)-Math.Min(step, totalAmount - i), 0);
                            Thread.Sleep(10);
                        }
                    }
                }
            }
        }
    }
}
